"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface GameState {
  nodemcuDetectado: boolean
  jugador: number
  velocidad: number
  distancia: number
  velocidadMedia: number
  distanciaFinal: number
  distanciaRival: number
  rivalVelocidad: number
  gameActive: boolean
  connectionMethod: string | null
  isMultiplayer: boolean
  clickCount: number
  lastSensorTime: number
  totalClicks: number
}

export default function BikeRaceGame() {
  const [currentPage, setCurrentPage] = useState("inicio")
  const [gameState, setGameState] = useState<GameState>({
    nodemcuDetectado: false,
    jugador: 1,
    velocidad: 0,
    distancia: 0,
    velocidadMedia: 0,
    distanciaFinal: 0,
    distanciaRival: 0,
    rivalVelocidad: 0,
    gameActive: false,
    connectionMethod: null,
    isMultiplayer: false,
    clickCount: 0,
    lastSensorTime: 0,
    totalClicks: 0,
  })

  const [timeLeft, setTimeLeft] = useState(60)
  const [connectionStatus, setConnectionStatus] = useState("Verificando compatibilidad...")
  const [isConnected, setIsConnected] = useState(false)
  const [isPedaling, setIsPedaling] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [serialSupported, setSerialSupported] = useState(false)
  const [permissionError, setPermissionError] = useState(false)
  const [sensorData, setSensorData] = useState("")
  const [rawSerialData, setRawSerialData] = useState<string[]>([])
  const [connectionLog, setConnectionLog] = useState<string[]>([])
  const [ledStatus, setLedStatus] = useState(false)
  const [sensorStatus, setSensorStatus] = useState("Esperando...")
  const [lastClickTime, setLastClickTime] = useState<string>("")

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null)
  const rivalTimerRef = useRef<NodeJS.Timeout | null>(null)
  const serialPortRef = useRef<any>(null)
  const writerRef = useRef<any>(null)
  const velocityDecayRef = useRef<NodeJS.Timeout | null>(null)
  const readingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Agregar log de conexión
  const addConnectionLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setConnectionLog((prev) => [...prev.slice(-4), `${timestamp}: ${message}`])
  }

  // Verificar soporte de Web Serial API y permisos
  useEffect(() => {
    checkSerialSupport()
  }, [])

  // Efecto para reducir velocidad gradualmente
  useEffect(() => {
    if (gameState.gameActive && gameState.velocidad > 0) {
      velocityDecayRef.current = setTimeout(() => {
        setGameState((prev) => ({
          ...prev,
          velocidad: Math.max(0, prev.velocidad * 0.95),
        }))
      }, 1000)
    }

    return () => {
      if (velocityDecayRef.current) {
        clearTimeout(velocityDecayRef.current)
      }
    }
  }, [gameState.velocidad, gameState.gameActive])

  const checkSerialSupport = async () => {
    try {
      if (!("serial" in navigator)) {
        setSerialSupported(false)
        setConnectionStatus("Web Serial API no disponible. Usa Chrome/Edge en una ventana normal.")
        addConnectionLog("Web Serial API no disponible")
        return
      }

      if (window.self !== window.top) {
        setPermissionError(true)
        setConnectionStatus("Web Serial API bloqueada en iframe. Abre la aplicación en una ventana nueva.")
        addConnectionLog("Detectado iframe - permisos restringidos")
        return
      }

      setSerialSupported(true)
      setConnectionStatus("Web Serial API disponible. Listo para conectar NodeMCU.")
      addConnectionLog("Web Serial API disponible")
    } catch (error) {
      console.error("Error verificando soporte:", error)
      setPermissionError(true)
      setConnectionStatus("Error verificando compatibilidad. Usa modo alternativo.")
      addConnectionLog(`Error: ${error}`)
    }
  }

  const calculateSpeed = (sensorInterval: number) => {
    if (sensorInterval < 200) return 50
    if (sensorInterval < 500) return 35
    if (sensorInterval < 1000) return 25
    if (sensorInterval < 2000) return 15
    return 10
  }

  const connectToNodeMCU = async () => {
    if (!serialSupported || permissionError) {
      setConnectionStatus("Web Serial API no disponible. Usando modo simulado.")
      addConnectionLog("Fallback a modo simulado")
      startSimulatedConnection()
      return
    }

    setIsDetecting(true)
    setConnectionStatus("Selecciona el puerto del NodeMCU en el diálogo...")
    addConnectionLog("Solicitando puerto serie...")

    try {
      const port = await (navigator as any).serial.requestPort()
      addConnectionLog("Puerto seleccionado, abriendo conexión...")

      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      })

      addConnectionLog("✅ Puerto abierto exitosamente")
      serialPortRef.current = port
      setIsConnected(true)
      setGameState((prev) => ({ ...prev, nodemcuDetectado: true, connectionMethod: "usb" }))
      setIsDetecting(false)
      setConnectionStatus("¡NodeMCU conectado! Configurando comunicación...")

      // Configurar writer
      const textEncoder = new TextEncoderStream()
      textEncoder.readable.pipeTo(port.writable)
      const writer = textEncoder.writable.getWriter()
      writerRef.current = writer

      // Iniciar lectura con intervalos (NO BLOQUEANTE)
      startPeriodicReading(port)

      // Enviar comando de inicialización
      setTimeout(async () => {
        try {
          await writer.write("INIT\n")
          addConnectionLog("Comando INIT enviado")
          setConnectionStatus("¡NodeMCU listo! Esperando datos del sensor...")
          setSensorStatus("Sensor listo")
        } catch (e) {
          addConnectionLog("Error enviando INIT")
        }
      }, 1000)

      // Ir a selección de modo
      setTimeout(() => {
        setCurrentPage("seleccionModo")
      }, 3000)
    } catch (error: any) {
      console.error("Error conectando:", error)
      addConnectionLog(`Error: ${error.message}`)

      if (error.name === "NotFoundError") {
        setConnectionStatus("No se seleccionó ningún dispositivo.")
      } else {
        setConnectionStatus(`Error de conexión. Usando modo simulado.`)
        setTimeout(() => {
          startSimulatedConnection()
        }, 2000)
      }

      setIsDetecting(false)
    }
  }

  // LECTURA PERIÓDICA NO BLOQUEANTE
  const startPeriodicReading = (port: any) => {
    addConnectionLog("🔍 Iniciando lectura periódica...")
    setSensorStatus("Escuchando sensor...")

    let buffer = ""

    const readChunk = async () => {
      try {
        if (!port.readable) return

        const reader = port.readable.getReader()
        const decoder = new TextDecoder()

        try {
          // Leer con timeout muy corto
          const { value, done } = await Promise.race([
            reader.read(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 100)),
          ])

          if (done) {
            addConnectionLog("Lectura terminada")
            return
          }

          if (value) {
            const text = decoder.decode(value, { stream: true })
            buffer += text

            // Procesar líneas completas
            const lines = buffer.split(/[\r\n]+/)
            buffer = lines.pop() || ""

            for (const line of lines) {
              const cleanLine = line.trim()
              if (cleanLine) {
                processSerialData(cleanLine)
              }
            }
          }
        } finally {
          reader.releaseLock()
        }
      } catch (error: any) {
        if (error.message !== "timeout") {
          console.error("Error leyendo:", error)
          addConnectionLog(`Error leyendo: ${error.message}`)
        }
      }
    }

    // Leer cada 200ms (NO BLOQUEANTE)
    readingIntervalRef.current = setInterval(readChunk, 200)
  }

  const processSerialData = (data: string) => {
    setRawSerialData((prev) => [...prev.slice(-9), data])
    setSensorData(data)
    addConnectionLog(`📡 Recibido: "${data}"`)

    const lowerData = data.toLowerCase()

    if (lowerData === "click" || lowerData === "sensor_activated" || data === "1") {
      addConnectionLog("🚴‍♂️ ¡SENSOR FÍSICO ACTIVADO!")
      setSensorStatus("¡Sensor activado!")
      setLastClickTime(new Date().toLocaleTimeString())
      setLedStatus(true)
      setTimeout(() => {
        setLedStatus(false)
        setSensorStatus("Esperando sensor...")
      }, 300)
      handleSensorActivation()
    } else if (lowerData.includes("listo") || lowerData.includes("ready") || lowerData.includes("inicializado")) {
      addConnectionLog("✅ NodeMCU inicializado correctamente")
      setConnectionStatus("¡NodeMCU listo! Sensor HW-511 funcionando.")
      setSensorStatus("Sensor listo")
    } else if (lowerData.includes("led_on")) {
      setLedStatus(true)
      addConnectionLog("💡 LED encendido")
    } else if (lowerData.includes("led_off")) {
      setLedStatus(false)
      addConnectionLog("💡 LED apagado")
    } else if (lowerData.includes("prueba") || lowerData.includes("test")) {
      addConnectionLog("🧪 Comando de prueba recibido por NodeMCU")
    }
  }

  const handleSensorActivation = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - gameState.lastSensorTime

    addConnectionLog(`⚡ PROCESANDO CLICK - Intervalo: ${timeDiff}ms`)

    // Activar animación de pedaleo
    setIsPedaling(true)
    setTimeout(() => setIsPedaling(false), 500)

    setGameState((prev) => {
      // SIEMPRE incrementar el contador total de clicks
      const newTotalClicks = prev.totalClicks + 1

      // Si el juego está activo, calcular velocidad y distancia
      let newVelocidad = prev.velocidad
      let newDistancia = prev.distancia
      let newClickCount = prev.clickCount

      if (prev.gameActive) {
        newVelocidad = calculateSpeed(timeDiff)
        // Cada click agrega distancia base + bonus por velocidad
        const distanceIncrement = 3 + newVelocidad / 8 // 3 metros base + bonus
        newDistancia = prev.distancia + distanceIncrement
        newClickCount = prev.clickCount + 1

        addConnectionLog(
          `🏃‍♂️ JUEGO ACTIVO - Velocidad: ${Math.round(newVelocidad)}km/h | Distancia: +${Math.round(distanceIncrement)}m | Total: ${Math.round(newDistancia)}m`,
        )
      } else {
        addConnectionLog(`📊 Click registrado (juego no activo) - Total clicks: ${newTotalClicks}`)
      }

      return {
        ...prev,
        velocidad: newVelocidad,
        distancia: newDistancia,
        clickCount: newClickCount,
        totalClicks: newTotalClicks,
        lastSensorTime: currentTime,
      }
    })
  }

  const testSensor = async () => {
    if (writerRef.current) {
      try {
        await writerRef.current.write("TEST_SENSOR\n")
        addConnectionLog("🧪 Comando de prueba del sensor enviado")
        setSensorStatus("Enviando prueba...")
      } catch (error) {
        addConnectionLog("❌ Error enviando comando de prueba")
      }
    }
  }

  const requestSensorStatus = async () => {
    if (writerRef.current) {
      try {
        await writerRef.current.write("STATUS\n")
        addConnectionLog("📊 Solicitando estado del sensor")
      } catch (error) {
        addConnectionLog("❌ Error solicitando estado")
      }
    }
  }

  const startSimulatedConnection = () => {
    setConnectionStatus("Modo simulado activado - Sensor virtual conectado")
    setIsConnected(true)
    setGameState((prev) => ({ ...prev, nodemcuDetectado: true, connectionMethod: "simulated" }))
    addConnectionLog("Modo simulado iniciado")

    setTimeout(() => {
      setCurrentPage("seleccionModo")
    }, 1500)
  }

  const disconnectNodeMCU = async () => {
    try {
      // Limpiar interval de lectura
      if (readingIntervalRef.current) {
        clearInterval(readingIntervalRef.current)
        addConnectionLog("Interval de lectura detenido")
      }

      if (writerRef.current) {
        await writerRef.current.close()
        addConnectionLog("Writer cerrado")
      }

      if (serialPortRef.current) {
        await serialPortRef.current.close()
        addConnectionLog("Puerto serie cerrado")
      }

      setIsConnected(false)
      setConnectionStatus("NodeMCU desconectado")
      setGameState((prev) => ({ ...prev, nodemcuDetectado: false }))
      setRawSerialData([])
      setSensorData("")
      setLedStatus(false)
      setSensorStatus("Desconectado")
    } catch (error) {
      console.error("Error desconectando:", error)
      addConnectionLog(`Error desconectando: ${error}`)
    }
  }

  const startGame = (isMultiplayer: boolean) => {
    setGameState((prev) => ({
      ...prev,
      gameActive: true,
      isMultiplayer,
      velocidad: 0,
      distancia: 0,
      distanciaRival: 0,
      clickCount: 0,
      lastSensorTime: Date.now(),
    }))
    setTimeLeft(60)
    setCurrentPage(isMultiplayer ? "juegoMultijugador" : "juegoUnJugador")
    addConnectionLog(`🎮 JUEGO INICIADO - Modo: ${isMultiplayer ? "Multijugador" : "Individual"}`)
    addConnectionLog(`🔥 ¡Activa el sensor físico para hacer avanzar la bici!`)

    gameTimerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endGame()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    if (isMultiplayer) {
      rivalTimerRef.current = setInterval(() => {
        setGameState((prev) => {
          const newRivalVelocidad = Math.random() * 40
          const rivalDistanceIncrement = newRivalVelocidad / 3.6
          return {
            ...prev,
            rivalVelocidad: newRivalVelocidad,
            distanciaRival: prev.distanciaRival + rivalDistanceIncrement,
          }
        })
      }, 1000)
    }
  }

  const endGame = () => {
    setGameState((prev) => ({ ...prev, gameActive: false }))
    if (gameTimerRef.current) clearInterval(gameTimerRef.current)
    if (rivalTimerRef.current) clearInterval(rivalTimerRef.current)
    addConnectionLog("🏁 Juego terminado")

    setGameState((prev) => ({
      ...prev,
      distanciaFinal: Math.round(prev.distancia),
      velocidadMedia: prev.clickCount > 0 ? Math.round((prev.distancia / 60) * 3.6) : 0,
    }))

    setCurrentPage("resultados")
  }

  const handleManualPedal = () => {
    addConnectionLog("👆 Click manual procesado")
    handleSensorActivation()
  }

  const openInNewWindow = () => {
    const newWindow = window.open(window.location.href, "_blank", "width=1200,height=800")
    if (newWindow) {
      newWindow.focus()
    }
  }

  const renderInicio = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-gray-800 flex items-center justify-center gap-3">
          🚴‍♂️ Bike Race Sensor Game
        </h1>
        <p className="text-lg text-gray-600">Conectá tu NodeMCU con sensor infrarrojo HW-511 (pin D2) para comenzar.</p>
      </div>

      {permissionError && (
        <Alert>
          <AlertDescription className="space-y-2">
            <p>⚠️ Web Serial API bloqueada en este entorno.</p>
            <Button onClick={openInNewWindow} variant="outline" size="sm">
              🔗 Abrir en ventana nueva
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-6 space-y-6">
          <div
            className={`p-4 rounded-lg border ${
              isConnected
                ? "bg-green-50 border-green-200"
                : permissionError
                  ? "bg-orange-50 border-orange-200"
                  : serialSupported
                    ? "bg-blue-50 border-blue-200"
                    : "bg-red-50 border-red-200"
            }`}
          >
            <div className={isDetecting ? "animate-pulse" : ""}>
              <span
                className={`${
                  isConnected
                    ? "text-green-800"
                    : permissionError
                      ? "text-orange-800"
                      : serialSupported
                        ? "text-blue-800"
                        : "text-red-800"
                }`}
              >
                {isConnected ? "✅" : permissionError ? "⚠️" : serialSupported ? "🔌" : "❌"} {connectionStatus}
              </span>
            </div>
          </div>

          {/* Estado del sensor físico */}
          {isConnected && gameState.connectionMethod === "usb" && (
            <div className="grid grid-cols-2 gap-4">
              <div
                className={`p-3 rounded-lg border ${sensorStatus.includes("activado") ? "bg-green-100 border-green-300" : "bg-blue-100 border-blue-300"}`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">🔍</div>
                  <div className="text-sm font-medium">Estado Sensor</div>
                  <div className="text-xs">{sensorStatus}</div>
                </div>
              </div>
              <div
                className={`p-3 rounded-lg border ${ledStatus ? "bg-green-100 border-green-300" : "bg-gray-100 border-gray-300"}`}
              >
                <div className="text-center">
                  <div
                    className={`w-4 h-4 rounded-full mx-auto mb-1 ${ledStatus ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
                  ></div>
                  <div className="text-sm font-medium">LED NodeMCU</div>
                  <div className="text-xs">{ledStatus ? "🟢 ON" : "⚫ OFF"}</div>
                </div>
              </div>
            </div>
          )}

          {/* Contador de clicks total */}
          {gameState.totalClicks > 0 && (
            <div className="p-4 bg-blue-100 rounded-lg">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-800 mb-1">{gameState.totalClicks}</div>
                <div className="text-sm text-blue-600">Total Clicks Detectados</div>
                {lastClickTime && <div className="text-xs text-blue-500">Último: {lastClickTime}</div>}
              </div>
            </div>
          )}

          {/* Mostrar datos del sensor en tiempo real */}
          {sensorData && (
            <div className="p-3 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600">Último dato del sensor:</p>
              <code
                className={`text-sm font-mono font-bold ${sensorData.toLowerCase() === "click" ? "text-green-600 animate-pulse" : "text-gray-600"}`}
              >
                {sensorData}
              </code>
            </div>
          )}

          {/* Log de datos serie raw */}
          {rawSerialData.length > 0 && (
            <div className="p-3 bg-gray-50 rounded-lg max-h-32 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">Datos serie recibidos:</p>
              {rawSerialData.map((data, index) => (
                <div key={index} className="text-xs font-mono">
                  <span className="text-gray-400">{index + 1}:</span>{" "}
                  <span className={data.toLowerCase() === "click" ? "text-green-600 font-bold" : "text-gray-600"}>
                    {data}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            <Button onClick={connectToNodeMCU} className="w-full" disabled={isDetecting || isConnected}>
              🔌 {isDetecting ? "Conectando..." : isConnected ? "NodeMCU Conectado" : "Conectar NodeMCU por USB"}
            </Button>

            {isConnected && gameState.connectionMethod === "usb" && (
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={testSensor} variant="outline" size="sm">
                  🧪 Probar
                </Button>
                <Button onClick={requestSensorStatus} variant="outline" size="sm">
                  📊 Estado
                </Button>
                <Button onClick={disconnectNodeMCU} variant="outline" size="sm">
                  🔌 Desconectar
                </Button>
              </div>
            )}
          </div>

          {/* Log de conexión */}
          {connectionLog.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg max-h-40 overflow-y-auto">
              <p className="text-xs text-blue-600 mb-2">Log de conexión:</p>
              {connectionLog.map((log, index) => (
                <div key={index} className="text-xs text-blue-800 mb-1">
                  {log}
                </div>
              ))}
            </div>
          )}

          <div className="text-sm text-gray-500 space-y-2">
            <p>
              <strong>Estado Actual:</strong>
            </p>
            <ul className="text-left space-y-1">
              <li>• ✅ Conexión: {isConnected ? "OK - Lectura periódica activa" : "No conectado"}</li>
              <li>• ✅ Envío de comandos: {isConnected ? "Funciona (botón Probar)" : "N/A"}</li>
              <li>• 🔍 Recepción de "click": {gameState.totalClicks > 0 ? "OK" : "Verificar sensor"}</li>
              <li>• 📡 Sensor HW-511 en D2: Debe enviar "click" al activarse</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Modo de Prueba</h3>
            <Button
              variant="outline"
              onClick={() => {
                setGameState((prev) => ({ ...prev, nodemcuDetectado: true, connectionMethod: "manual" }))
                setConnectionStatus("Modo manual activado")
                setIsConnected(true)
                addConnectionLog("Modo manual iniciado")
                setTimeout(() => setCurrentPage("seleccionModo"), 1000)
              }}
              className="w-full bg-transparent"
            >
              👆 Usar Modo Manual (Sin Hardware)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Código NodeMCU ultra simple */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔧 Código NodeMCU Ultra Simple</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto">
            <pre>{`// Código NodeMCU ULTRA SIMPLE - Sin bloqueos
const int sensorPin = D2;
const int ledPin = LED_BUILTIN;

bool lastState = HIGH;
unsigned long lastTime = 0;

void setup() {
  Serial.begin(115200);
  pinMode(sensorPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, HIGH);
  
  delay(500);
  Serial.println("Sistema listo para detectar sensor");
}

void loop() {
  bool currentState = digitalRead(sensorPin);
  
  // Detectar activación
  if (currentState == LOW && lastState == HIGH) {
    if (millis() - lastTime > 200) { // Debounce
      Serial.println("click");
      
      // LED rápido
      digitalWrite(ledPin, LOW);
      delay(50);
      digitalWrite(ledPin, HIGH);
      
      lastTime = millis();
    }
  }
  
  lastState = currentState;
  
  // Comandos simples
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    
    if (cmd == "TEST_SENSOR") {
      Serial.println("click");
      digitalWrite(ledPin, LOW);
      delay(100);
      digitalWrite(ledPin, HIGH);
    }
  }
  
  delay(5); // Muy pequeño delay
}`}</pre>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ IMPORTANTE: Este código es ultra simple y no debería causar bloqueos
          </p>
        </CardContent>
      </Card>
    </div>
  )

  const renderSeleccionModo = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <h1 className="text-3xl font-bold text-gray-800">Seleccioná el modo de juego</h1>

      <div className="mb-4 space-y-2">
        <Badge variant="outline" className="p-2">
          Conectado via {gameState.connectionMethod === "usb" ? "USB Real" : "Modo Manual"}
        </Badge>
        {gameState.totalClicks > 0 && (
          <div className="text-sm text-blue-600">🎯 Total clicks detectados: {gameState.totalClicks}</div>
        )}
        {gameState.connectionMethod === "usb" && (
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ledStatus ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}></div>
              <span className="text-sm">LED: {ledStatus ? "ON" : "OFF"}</span>
            </div>
            <div className="text-sm text-gray-600">Sensor: {sensorStatus}</div>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => startGame(false)}>
          <CardHeader className="text-center">
            <div className="text-6xl mb-4">👤</div>
            <CardTitle>Jugador Individual</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              {gameState.connectionMethod === "usb"
                ? "Activa el sensor HW-511 para pedalear"
                : "Haz clic para pedalear"}
            </p>
            <p className="text-xs text-gray-500">Cada activación suma 3+ metros</p>
            <Button className="w-full">Comenzar Solo</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => startGame(true)}>
          <CardHeader className="text-center">
            <div className="text-6xl mb-4">👥</div>
            <CardTitle>Multijugador</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">Competí contra un rival IA en tiempo real</p>
            <p className="text-xs text-gray-500">¡Pedaleá más rápido para ganar!</p>
            <Button className="w-full" variant="secondary">
              Competir
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )

  const renderJuegoUnJugador = () => (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-800">Modo Individual</h1>
        <p className="text-lg text-gray-600">
          {gameState.connectionMethod === "usb"
            ? "¡Activa el sensor HW-511 físico para hacer circular la bici!"
            : "¡Haz clic para pedalear!"}
        </p>
        <div className="flex items-center justify-center gap-4">
          <Badge variant="outline">
            {gameState.connectionMethod === "usb" ? "Sensor HW-511 Activo" : "Modo Manual"}
          </Badge>
          {gameState.connectionMethod === "usb" && (
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${ledStatus ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}></div>
              <span className="text-xs">LED: {ledStatus ? "ON" : "OFF"}</span>
            </div>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-4xl font-bold text-red-600 mb-2">{timeLeft}</div>
              <p className="text-gray-600">Segundos</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-blue-600 mb-2">{Math.round(gameState.velocidad)}</div>
              <p className="text-gray-600">km/h</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-green-600 mb-2">{Math.round(gameState.distancia)}</div>
              <p className="text-gray-600">metros</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600 mb-2">{gameState.clickCount}</div>
              <p className="text-gray-600">Clicks</p>
            </div>
          </div>

          <div className="space-y-4">
            <Progress value={Math.min(100, (gameState.velocidad / 50) * 100)} className="h-4" />
            <p className="text-center text-sm text-gray-600">
              🎮 JUEGO ACTIVO - Activa el sensor físico para avanzar | Clicks: {gameState.clickCount} | Total:{" "}
              {gameState.totalClicks}
            </p>
          </div>

          <div className="text-center space-y-4">
            <div
              className={`inline-block text-8xl cursor-pointer select-none hover:scale-110 transition-transform ${
                isPedaling ? "animate-bounce scale-110" : ""
              }`}
              onClick={gameState.connectionMethod === "manual" ? handleManualPedal : undefined}
              style={{
                filter: isPedaling ? "drop-shadow(0 0 20px #3b82f6)" : "none",
                transform: isPedaling ? "scale(1.1)" : "scale(1)",
              }}
            >
              🚴‍♂️
            </div>
            <div className={`text-4xl ${isPedaling ? "animate-spin" : ""}`}>⚙️</div>
            <p className="text-gray-600">
              {gameState.connectionMethod === "usb"
                ? "🔥 ¡Activa el sensor infrarrojo HW-511 en pin D2!"
                : "Haz clic en la bicicleta para pedalear"}
            </p>
            <p className="text-sm text-blue-600">Cada activación suma 3+ metros (más bonus por velocidad)</p>

            {/* Estado del sensor durante el juego */}
            {gameState.connectionMethod === "usb" && (
              <div className="mt-4 p-3 bg-blue-100 rounded text-sm">
                <strong>Estado del sensor:</strong> {sensorStatus}
                {lastClickTime && <div className="text-xs">Último click: {lastClickTime}</div>}
              </div>
            )}

            {gameState.connectionMethod === "usb" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={testSensor} variant="outline" size="sm">
                  🧪 Probar Sensor
                </Button>
                <Button onClick={requestSensorStatus} variant="outline" size="sm">
                  📊 Estado Sensor
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderJuegoMultijugador = () => (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-gray-800">Modo Competencia</h1>
        <p className="text-lg text-gray-600">
          {gameState.connectionMethod === "usb" ? "¡Activa el sensor HW-511 para ganar!" : "¡Haz clic para ganar!"}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-blue-600">Tu Progreso (Derecha)</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="space-y-2">
              <div className="text-3xl font-bold text-blue-600">{Math.round(gameState.velocidad)} km/h</div>
              <div className="text-2xl font-semibold text-green-600">{Math.round(gameState.distancia)} m</div>
            </div>
            <div
              className={`text-6xl ${isPedaling ? "animate-bounce" : ""}`}
              style={{
                filter: isPedaling ? "drop-shadow(0 0 15px #3b82f6)" : "none",
                transform: isPedaling ? "scale(1.1)" : "scale(1)",
              }}
            >
              🚴‍♂️
            </div>
            <Badge variant="outline">Clicks: {gameState.clickCount}</Badge>
            {gameState.connectionMethod === "usb" && (
              <div className="flex items-center justify-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${ledStatus ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
                ></div>
                <span className="text-xs">LED: {ledStatus ? "ON" : "OFF"}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-center text-red-600">Rival IA (Izquierda)</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="space-y-2">
              <div className="text-3xl font-bold text-red-600">{Math.round(gameState.rivalVelocidad)} km/h</div>
              <div className="text-2xl font-semibold text-green-600">{Math.round(gameState.distanciaRival)} m</div>
            </div>
            <div className={`text-6xl transform scale-x-[-1] ${gameState.rivalVelocidad > 10 ? "animate-bounce" : ""}`}>
              🚴‍♂️
            </div>
            <Badge variant="outline">IA Inteligente</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="text-center">
            <div className="text-5xl font-bold text-red-600 mb-2">{timeLeft}</div>
            <p className="text-gray-600">Segundos restantes</p>
            <p className="text-sm text-blue-600 mt-2">🔥 ¡Activa el sensor físico para avanzar!</p>
          </div>

          <div className="text-center space-y-4">
            <div
              className={`inline-block text-8xl cursor-pointer select-none hover:scale-110 transition-transform ${
                isPedaling ? "animate-bounce scale-110" : ""
              }`}
              onClick={gameState.connectionMethod === "manual" ? handleManualPedal : undefined}
              style={{
                filter: isPedaling ? "drop-shadow(0 0 20px #3b82f6)" : "none",
              }}
            >
              🚴‍♂️
            </div>
            <div className={`text-4xl ${isPedaling ? "animate-spin" : ""}`}>⚙️</div>

            {gameState.connectionMethod === "usb" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={testSensor} variant="outline" size="sm">
                  🧪 Probar Sensor
                </Button>
                <Button onClick={requestSensorStatus} variant="outline" size="sm">
                  📊 Estado Sensor
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )

  const renderResultados = () => {
    const ganaste = gameState.isMultiplayer ? gameState.distancia > gameState.distanciaRival : true
    const empate = gameState.isMultiplayer ? Math.abs(gameState.distancia - gameState.distanciaRival) < 1 : false

    return (
      <div className="max-w-2xl mx-auto text-center space-y-8">
        <h1 className="text-4xl font-bold text-gray-800">¡Fin del Juego!</h1>

        <Card>
          <CardContent className="p-8 space-y-6">
            <div className="text-6xl mb-6">
              {gameState.isMultiplayer ? (ganaste ? "🏆" : empate ? "🤝" : "🥈") : "🏁"}
            </div>

            <h2 className="text-2xl font-semibold mb-6">
              {gameState.isMultiplayer ? (ganaste ? "¡Ganaste!" : empate ? "¡Empate!" : "Perdiste") : "Tu rendimiento:"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-2">{gameState.distanciaFinal} m</div>
                <p className="text-gray-600">Distancia Final</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-2">{gameState.velocidadMedia} km/h</div>
                <p className="text-gray-600">Velocidad Media</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600 mb-2">{gameState.clickCount}</div>
                <p className="text-gray-600">
                  {gameState.connectionMethod === "usb" ? "Activaciones del Sensor" : "Clicks Manuales"}
                </p>
              </div>
            </div>

            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-800 mb-2">{gameState.totalClicks}</div>
              <p className="text-blue-600">Total de clicks detectados en toda la sesión</p>
            </div>

            {gameState.isMultiplayer && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-xl font-semibold">Resultado de la Competencia</h3>
                <div className="grid grid-cols-2 gap-4">
                  <Badge variant="outline" className="p-2">
                    Tú: {Math.round(gameState.distancia)}m
                  </Badge>
                  <Badge variant="outline" className="p-2">
                    Rival: {Math.round(gameState.distanciaRival)}m
                  </Badge>
                </div>
              </div>
            )}

            <Button
              onClick={() => {
                setCurrentPage("inicio")
                setGameState((prev) => ({ ...prev, nodemcuDetectado: false, gameActive: false }))
                if (!isConnected) {
                  setConnectionStatus("Verificando compatibilidad...")
                  checkSerialSupport()
                }
              }}
              className="w-full"
            >
              🏠 Volver al Inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <div className="container mx-auto py-8">
        {currentPage === "inicio" && renderInicio()}
        {currentPage === "seleccionModo" && renderSeleccionModo()}
        {currentPage === "juegoUnJugador" && renderJuegoUnJugador()}
        {currentPage === "juegoMultijugador" && renderJuegoMultijugador()}
        {currentPage === "resultados" && renderResultados()}
      </div>
    </div>
  )
}
