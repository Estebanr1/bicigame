# 🚴‍♂️ Bike Race Sensor Game V11 FINAL

Juego de carreras de bicicleta con sensor infrarrojo HW-511 y NodeMCU.

## 🚀 Características V11 FINAL

- ✅ **Sin bloqueos garantizado** - Lectura periódica optimizada
- 🔌 **Conexión USB real** con NodeMCU via Web Serial API
- 🎮 **Modo manual** para pruebas sin hardware
- 📊 **Estadísticas en tiempo real** - velocidad, distancia, clicks
- 🏆 **Modo multijugador** contra IA
- 💡 **Diagnósticos completos** - LED, sensor, logs

## 🌐 Demo en Vivo

**GitHub Pages:** https://tu-usuario.github.io/bike-race-sensor-game/

## 🛠️ Instalación Local

\`\`\`bash
# Clonar repositorio
git clone https://github.com/tu-usuario/bike-race-sensor-game.git
cd bike-race-sensor-game

# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Construir para producción
npm run build
\`\`\`

## 📡 Hardware Requerido

- **NodeMCU** (ESP8266)
- **Sensor infrarrojo HW-511** conectado al pin D2
- **Cable USB** para conexión

## 🔧 Código NodeMCU

\`\`\`cpp
// Código NodeMCU ULTRA SIMPLE V11 FINAL
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
    String cmd = Serial.readStringUntil('\n');
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
}
\`\`\`

## 🎯 Cómo Usar

1. **Conectar Hardware:**
   - Subir código al NodeMCU
   - Conectar sensor HW-511 al pin D2
   - Conectar NodeMCU por USB

2. **Abrir Aplicación:**
   - Ir a la demo en vivo o ejecutar localmente
   - Hacer clic en "Conectar NodeMCU V11 FINAL por USB"
   - Seleccionar puerto en el diálogo

3. **Jugar:**
   - Elegir modo individual o multijugador
   - Activar el sensor físico para pedalear
   - ¡Competir por la mejor distancia!

## 🔍 Solución de Problemas

### Web Serial API no disponible
- Usar Chrome o Edge (no Firefox)
- Abrir en ventana normal (no iframe)
- Usar HTTPS o localhost

### NodeMCU no detectado
- Verificar drivers USB
- Probar diferentes puertos
- Usar modo manual como alternativa

### Sensor no responde
- Verificar conexión en pin D2
- Usar botón "Probar V11 FINAL"
- Revisar logs de conexión

## 📈 Versiones

- **V11 FINAL** - Sin bloqueos, lectura periódica optimizada
- **V10** - Manejo de errores mejorado
- **V9** - Múltiples baudrates
- **V8** - Diagnósticos avanzados

## 🤝 Contribuir

1. Fork del repositorio
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

MIT License - ver archivo [LICENSE](LICENSE) para detalles.

## 🎮 Créditos

Desarrollado para proyectos educativos con NodeMCU y sensores.
