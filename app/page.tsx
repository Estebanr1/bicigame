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

export default function BikeRaceGameV11Final() {
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
  const [connectionStatus, setConnectionStatus] = useState("🚀 VERSIÓN 11 FINAL - Verificando compatibilidad...")
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
    addConnectionLog("🚀 INICIANDO VERSIÓN 11 FINAL - SIN BLOQUEOS")
    console.log("🚀 BIKE RACE GAME VERSIÓN 11 FINAL CARGADA")
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
        setConnectionStatus("❌ Web Serial API no disponible. Usa Chrome/Edge en una ventana normal.")
        addConnectionLog("Web Serial API no disponible - V11 FINAL")
        return
      }

      if (window.self !== window.top) {
        setPermissionError(true)
        setConnectionStatus("⚠️ Web Serial API bloqueada en iframe. Abre la aplicación en una ventana nueva.")
        addConnectionLog("Detectado iframe - permisos restringidos - V11 FINAL")
        return
      }

      setSerialSupported(true)
      setConnectionStatus("✅ Web Serial API disponible. Listo para conectar NodeMCU V11 FINAL.")
      addConnectionLog("Web Serial API disponible - V11 FINAL lista")
    } catch (error) {
      console.error("Error verificando soporte V11 FINAL:", error)
      setPermissionError(true)
      setConnectionStatus("❌ Error verificando compatibilidad. Usa modo alternativo.")
      addConnectionLog(`Error V11 FINAL: ${error}`)
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
      setConnectionStatus("⚠️ Web Serial API no disponible. Usando modo simulado V11 FINAL.")
      addConnectionLog("Fallback a modo simulado V11 FINAL")
      startSimulatedConnection()
      return
    }

    setIsDetecting(true)
    setConnectionStatus("🔌 Selecciona el puerto del NodeMCU en el diálogo... (V11 FINAL)")
    addConnectionLog("Solicitando puerto serie V11 FINAL...")

    try {
      const port = await (navigator as any).serial.requestPort()
      addConnectionLog("Puerto seleccionado V11 FINAL, abriendo conexión...")

      await port.open({
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "none",
        flowControl: "none",
      })

      addConnectionLog("✅ Puerto abierto exitosamente V11 FINAL")
      serialPortRef.current = port
      setIsConnected(true)
      setGameState((prev) => ({ ...prev, nodemcuDetectado: true, connectionMethod: "usb" }))
      setIsDetecting(false)
      setConnectionStatus("🎉 ¡NodeMCU V11 FINAL conectado! Configurando comunicación...")

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
          addConnectionLog("Comando INIT V11 FINAL enviado")
          setConnectionStatus("🚀 ¡NodeMCU V11 FINAL listo! Esperando datos del sensor...")
          setSensorStatus("Sensor V11 FINAL listo")
        } catch (e) {
          addConnectionLog("Error enviando INIT V11 FINAL")
        }
      }, 1000)

      // Ir a selección de modo
      setTimeout(() => {
        setCurrentPage("seleccionModo")
      }, 3000)
    } catch (error: any) {
      console.error("Error conectando V11 FINAL:", error)
      addConnectionLog(`Error V11 FINAL: ${error.message}`)

      if (error.name === "NotFoundError") {
        setConnectionStatus("❌ No se seleccionó ningún dispositivo V11 FINAL.")
      } else {
        setConnectionStatus(`❌ Error de conexión V11 FINAL. Usando modo simulado.`)
        setTimeout(() => {
          startSimulatedConnection()
        }, 2000)
      }

      setIsDetecting(false)
    }
  }

  // LECTURA PERIÓDICA NO BLOQUEANTE V11 FINAL
  const startPeriodicReading = (port: any) => {
    addConnectionLog("🔍 Iniciando lectura periódica V11 FINAL...")
    setSensorStatus("Escuchando sensor V11 FINAL...")

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
            addConnectionLog("Lectura V11 FINAL terminada")
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
          console.error("Error leyendo V11 FINAL:", error)
          addConnectionLog(`Error leyendo V11 FINAL: ${error.message}`)
        }
      }
    }

    // Leer cada 200ms (NO BLOQUEANTE)
    readingIntervalRef.current = setInterval(readChunk, 200)
  }

  const processSerialData = (data: string) => {
    setRawSerialData((prev) => [...prev.slice(-9), data])
    setSensorData(data)
    addConnectionLog(`📡 V11 FINAL Recibido: "${data}"`)

    const lowerData = data.toLowerCase()

    if (lowerData === "click" || lowerData === "sensor_activated" || data === "1") {
      addConnectionLog("🚴‍♂️ ¡SENSOR FÍSICO V11 FINAL ACTIVADO!")
      setSensorStatus("¡Sensor V11 FINAL activado!")
      setLastClickTime(new Date().toLocaleTimeString())
      setLedStatus(true)
      setTimeout(() => {
        setLedStatus(false)
        setSensorStatus("Esperando sensor V11 FINAL...")
      }, 300)
      handleSensorActivation()
    } else if (lowerData.includes("listo") || lowerData.includes("ready") || lowerData.includes("inicializado")) {
      addConnectionLog("✅ NodeMCU V11 FINAL inicializado correctamente")
      setConnectionStatus("🎉 ¡NodeMCU V11 FINAL listo! Sensor HW-511 funcionando.")
      setSensorStatus("Sensor V11 FINAL listo")
    } else if (lowerData.includes("led_on")) {
      setLedStatus(true)
      addConnectionLog("💡 LED V11 FINAL encendido")
    } else if (lowerData.includes("led_off")) {
      setLedStatus(false)
      addConnectionLog("💡 LED V11 FINAL apagado")
    } else if (lowerData.includes("prueba") || lowerData.includes("test")) {
      addConnectionLog("🧪 Comando de prueba V11 FINAL recibido por NodeMCU")
    }
  }

  const handleSensorActivation = () => {
    const currentTime = Date.now()
    const timeDiff = currentTime - gameState.lastSensorTime

    addConnectionLog(`⚡ V11 FINAL PROCESANDO CLICK - Intervalo: ${timeDiff}ms`)

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
          `🏃‍♂️ V11 FINAL JUEGO ACTIVO - Velocidad: ${Math.round(newVelocidad)}km/h | Distancia: +${Math.round(distanceIncrement)}m | Total: ${Math.round(newDistancia)}m`,
        )
      } else {
        addConnectionLog(`📊 V11 FINAL Click registrado (juego no activo) - Total clicks: ${newTotalClicks}`)
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
        addConnectionLog("🧪 V11 FINAL Comando de prueba del sensor enviado")
        setSensorStatus("Enviando prueba V11 FINAL...")
      } catch (error) {
        addConnectionLog("❌ V11 FINAL Error enviando comando de prueba")
      }
    }
  }

  const requestSensorStatus = async () => {
    if (writerRef.current) {
      try {
        await writerRef.current.write("STATUS\n")
        addConnectionLog("📊 V11 FINAL Solicitando estado del sensor")
      } catch (error) {
        addConnectionLog("❌ V11 FINAL Error solicitando estado")
      }
    }
  }

  const startSimulatedConnection = () => {
    setConnectionStatus("🎮 Modo simulado V11 FINAL activado - Sensor virtual conectado")
    setIsConnected(true)
    setGameState((prev) => ({ ...prev, nodemcuDetectado: true, connectionMethod: "simulated" }))
    addConnectionLog("Modo simulado V11 FINAL iniciado")

    setTimeout(() => {
      setCurrentPage("seleccionModo")
    }, 1500)
  }

  const disconnectNodeMCU = async () => {
    try {
      // Limpiar interval de lectura
      if (readingIntervalRef.current) {
        clearInterval(readingIntervalRef.current)
        addConnectionLog("V11 FINAL Interval de lectura detenido")
      }

      if (writerRef.current) {
        await writerRef.current.close()
        addConnectionLog("V11 FINAL Writer cerrado")
      }

      if (serialPortRef.current) {
        await serialPortRef.current.close()
        addConnectionLog("V11 FINAL Puerto serie cerrado")
      }

      setIsConnected(false)
      setConnectionStatus("🔌 NodeMCU V11 FINAL desconectado")
      setGameState((prev) => ({ ...prev, nodemcuDetectado: false }))
      setRawSerialData([])
      setSensorData("")
      setLedStatus(false)
      setSensorStatus("V11 FINAL Desconectado")
    } catch (error) {
      console.error("Error desconectando V11 FINAL:", error)
      addConnectionLog(`V11 FINAL Error desconectando: ${error}`)
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
    addConnectionLog(`🎮 V11 FINAL JUEGO INICIADO - Modo: ${isMultiplayer ? "Multijugador" : "Individual"}`)
    addConnectionLog(`🔥 V11 FINAL ¡Activa el sensor físico para hacer avanzar la bici!`)

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
    addConnectionLog("🏁 V11 FINAL Juego terminado")

    setGameState((prev) => ({
      ...prev,
      distanciaFinal: Math.round(prev.distancia),
      velocidadMedia: prev.clickCount > 0 ? Math.round((prev.distancia / 60) * 3.6) : 0,
    }))

    setCurrentPage("resultados")
  }

  const handleManualPedal = () => {
    addConnectionLog("👆 V11 FINAL Click manual procesado")
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
          🚴‍♂️ Bike Race Sensor Game V11 FINAL
        </h1>
        <p className="text-lg text-gray-600">Conectá tu NodeMCU con sensor infrarrojo HW-511 (pin D2) para comenzar.</p>
        <Badge variant="outline" className="text-xs bg-green-100 border-green-300">
          ✅ VERSIÓN 11 FINAL - Sin bloqueos - Lectura periódica optimizada
        </Badge>
        <div className="text-xs text-green-600 font-mono">
          ID: bike-race-sensor-game-v11-final | Build: {new Date().toISOString()}
        </div>
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
                  <div className="text-sm font-medium">Estado Sensor V11 FINAL</div>
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
                  <div className="text-sm font-medium">LED NodeMCU V11 FINAL</div>
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
                <div className="text-sm text-blue-600">Total Clicks Detectados V11 FINAL</div>
                {lastClickTime && <div className="text-xs text-blue-500">Último: {lastClickTime}</div>}
              </div>
            </div>
          )}

          {/* Mostrar datos del sensor en tiempo real */}
          {sensorData && (
            <div className="p-3 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-600">Último dato del sensor V11 FINAL:</p>
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
              <p className="text-xs text-gray-500 mb-2">Datos serie V11 FINAL recibidos:</p>
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
              🔌{" "}
              {isDetecting
                ? "Conectando V11 FINAL..."
                : isConnected
                  ? "NodeMCU V11 FINAL Conectado"
                  : "Conectar NodeMCU V11 FINAL por USB"}
            </Button>

            {isConnected && gameState.connectionMethod === "usb" && (
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={testSensor} variant="outline" size="sm">
                  🧪 Probar V11 FINAL
                </Button>
                <Button onClick={requestSensorStatus} variant="outline" size="sm">
                  📊 Estado V11 FINAL
                </Button>
                <Button onClick={disconnectNodeMCU} variant="outline" size="sm">
                  🔌 Desconectar V11 FINAL
                </Button>
              </div>
            )}
          </div>

          {/* Log de conexión */}
          {connectionLog.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg max-h-40 overflow-y-auto">
              <p className="text-xs text-blue-600 mb-2">Log de conexión V11 FINAL:</p>
              {connectionLog.map((log, index) => (
                <div key={index} className="text-xs text-blue-800 mb-1">
                  {log}
                </div>
              ))}
            </div>
          )}

          <div className="text-sm text-gray-500 space-y-2">
            <p>
              <strong>Estado Actual V11 FINAL:</strong>
            </p>
            <ul className="text-left space-y-1">
              <li>• ✅ Conexión: {isConnected ? "OK - Lectura periódica V11 FINAL activa" : "No conectado"}</li>
              <li>• ✅ Envío de comandos: {isConnected ? "Funciona (botón Probar V11 FINAL)" : "N/A"}</li>
              <li>• 🔍 Recepción de "click": {gameState.totalClicks > 0 ? "OK V11 FINAL" : "Verificar sensor"}</li>
              <li>• 📡 Sensor HW-511 en D2: Debe enviar "click" al activarse</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Modo de Prueba V11 FINAL</h3>
            <Button
              variant="outline"
              onClick={() => {
                setGameState((prev) => ({ ...prev, nodemcuDetectado: true, connectionMethod: "manual" }))
                setConnectionStatus("Modo manual V11 FINAL activado")
                setIsConnected(true)
                addConnectionLog("Modo manual V11 FINAL iniciado")
                setTimeout(() => setCurrentPage("seleccionModo"), 1000)
              }}
              className="w-full bg-transparent"
            >
              👆 Usar Modo Manual V11 FINAL (Sin Hardware)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Código NodeMCU ultra simple V11 FINAL */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">🔧 Código NodeMCU Ultra Simple V11 FINAL</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm font-mono overflow-x-auto">
            <pre>{`// Código NodeMCU ULTRA SIMPLE V11 FINAL - Sin bloqueos
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
  Serial.println("Sistema V11 FINAL listo para detectar sensor");
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
    else if (cmd == "STATUS") {
      Serial.print("Sensor V11 FINAL: ");
      Serial.println(digitalRead(sensorPin) ? "HIGH" : "LOW");
    }
  }
  
  delay(5); // Muy pequeño delay V11 FINAL
}`}</pre>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ⚠️ IMPORTANTE: Este código V11 FINAL es ultra simple y no debería causar bloqueos
          </p>
        </CardContent>
      </Card>
    </div>
  )

  const renderSeleccionModo = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Selecciona el modo de juego</h2>
      <div className="grid grid-cols-2 gap-4">
        <Button onClick={() => startGame(false)} className="w-full">
          🏃‍♂️ Juego Individual
        </Button>
        <Button onClick={() => startGame(true)} className="w-full">
          🏃‍♂️ Juego Multijugador
        </Button>
      </div>
    </div>
  )

  const renderJuegoUnJugador = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Juego Individual V11 FINAL</h2>
      <div className="space-y-4">
        <div className="p-4 rounded-lg border bg-blue-100">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-800 mb-1">{Math.round(gameState.distancia)}m</div>
            <div className="text-sm text-blue-600">Distancia Recorrida</div>
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-green-100">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-800 mb-1">{Math.round(gameState.velocidad)}km/h</div>
            <div className="text-sm text-green-600">Velocidad Actual</div>
          </div>
        </div>
        <Progress value={(gameState.distancia / 1000) * 100} className="w-full">
          {Math.round((gameState.distancia / 1000) * 100)}%
        </Progress>
        <div className="text-sm text-gray-500 space-y-2">
          <p>
            <strong>Estado Actual V11 FINAL:</strong>
          </p>
          <ul className="text-left space-y-1">
            <li>• 🏃‍♂️ Juego Activo: {gameState.gameActive ? "Sí" : "No"}</li>
            <li>• ⏳ Tiempo Restante: {timeLeft}s</li>
          </ul>
        </div>
        <Button onClick={handleManualPedal} className="w-full bg-transparent">
          👆 Pedalear Manualmente V11 FINAL
        </Button>
      </div>
    </div>
  )

  const renderJuegoMultijugador = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Juego Multijugador V11 FINAL</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border bg-blue-100">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-800 mb-1">{Math.round(gameState.distancia)}m</div>
            <div className="text-sm text-blue-600">Tu Distancia</div>
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-red-100">
          <div className="text-center">
            <div className="text-3xl font-bold text-red-800 mb-1">{Math.round(gameState.distanciaRival)}m</div>
            <div className="text-sm text-red-600">Distancia Rival</div>
          </div>
        </div>
      </div>
      <Progress value={(gameState.distancia / 1000) * 100} className="w-full">
        {Math.round((gameState.distancia / 1000) * 100)}%
      </Progress>
      <div className="text-sm text-gray-500 space-y-2">
        <p>
          <strong>Estado Actual V11 FINAL:</strong>
        </p>
        <ul className="text-left space-y-1">
          <li>• 🏃‍♂️ Juego Activo: {gameState.gameActive ? "Sí" : "No"}</li>
          <li>• ⏳ Tiempo Restante: {timeLeft}s</li>
        </ul>
      </div>
      <Button onClick={handleManualPedal} className="w-full bg-transparent">
        👆 Pedalear Manualmente V11 FINAL
      </Button>
    </div>
  )

  const renderResultados = () => (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Resultados V11 FINAL</h2>
      <div className="space-y-4">
        <div className="p-4 rounded-lg border bg-blue-100">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-800 mb-1">{Math.round(gameState.distanciaFinal)}m</div>
            <div className="text-sm text-blue-600">Distancia Final</div>
          </div>
        </div>
        <div className="p-4 rounded-lg border bg-green-100">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-800 mb-1">{Math.round(gameState.velocidadMedia)}km/h</div>
            <div className="text-sm text-green-600">Velocidad Media</div>
          </div>
        </div>
        {gameState.isMultiplayer && (
          <div className="p-4 rounded-lg border bg-red-100">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-800 mb-1">{Math.round(gameState.distanciaRival)}m</div>
              <div className="text-sm text-red-600">Distancia Rival</div>
            </div>
          </div>
        )}
      </div>
      <Button onClick={() => setCurrentPage("inicio")} className="w-full bg-transparent">
        🔄 Volver al Inicio
      </Button>
    </div>
  )

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
