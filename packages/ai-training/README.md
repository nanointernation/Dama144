# IA Neuronal para Dama 144 (estilo AlphaZero)

Este paquete entrena una inteligencia artificial que aprende jugando contra
sí misma (auto-juego), en vez de seguir reglas de evaluación escritas a mano
como la IA clásica (`packages/engine/src/ai.ts`). Usa una red neuronal
(política + valor) guiada por búsqueda MCTS (Monte Carlo Tree Search),
la misma técnica general detrás de AlphaZero.

## Qué YA está construido y probado

- Codificación del tablero y las jugadas a tensores (`packages/neural-ai/src/encoding.ts`)
- La arquitectura de la red neuronal (`packages/neural-ai/src/network.ts`)
- La búsqueda MCTS guiada por la red (`packages/neural-ai/src/mcts.ts`)
- El generador de partidas de auto-juego (`packages/ai-training/src/selfplay.ts`)
- El ciclo de entrenamiento completo, con guardado/reanudación (`packages/ai-training/src/train.ts`)
- El script de exportación al formato que el navegador puede cargar (`export_for_browser.ts`)
- La integración en el juego: un modo "🧠 Neuronal" en el menú de dificultades,
  que carga el modelo entrenado y lo usa para jugar (`packages/client/src/neural-ai-worker.ts`)

Todo esto se probó de punta a punta: la red se construye, el MCTS elige
jugadas válidas, el auto-juego completa partidas, el entrenamiento corre y
guarda checkpoints, y el modelo exportado se carga correctamente **por HTTP**
exactamente como lo haría el navegador.

## Qué falta: el entrenamiento real

Lo que yo no puedo hacer es dejar esto entrenando por ti — mi entorno de
trabajo es una máquina temporal, sin GPU, que se reinicia entre
conversaciones. Un entrenamiento real que produzca una IA verdaderamente
fuerte necesita correr **horas o días**, en tu propia computadora (o mejor,
en una computadora con muchos núcleos, o una GPU alquilada).

### Paso 1: instalar dependencias

```bash
cd "/home/kolareal2030/Proyecto Dama 144/dama144-project"
npm install
npm run build:engine
npm run build -w packages/neural-ai
npm run build -w packages/ai-training
```

### Paso 2: correr un entrenamiento de prueba corto (para confirmar que funciona en tu maquina)

```bash
cd packages/ai-training
ITERATIONS=2 GAMES_PER_ITERATION=2 MCTS_SIMULATIONS=10 NUM_FILTERS=16 NUM_RES_BLOCKS=2 MAX_PLIES=40 npm run train
```

Esto debería tardar unos minutos y terminar sin errores, guardando una
carpeta `checkpoints/` con el modelo.

### Paso 3: el entrenamiento real (parámetros recomendados)

```bash
cd packages/ai-training
ITERATIONS=150 GAMES_PER_ITERATION=30 MCTS_SIMULATIONS=200 NUM_FILTERS=64 NUM_RES_BLOCKS=8 MAX_PLIES=150 RESUME=1 npm run train
```

**Esto va a tardar mucho tiempo** — probablemente varios días corriendo
continuamente en una computadora normal (sin GPU). Algunas notas importantes:

- `RESUME=1` hace que retome desde el ultimo checkpoint guardado — puedes
  parar el proceso (Ctrl+C) y volver a correr el mismo comando despues, sin
  perder el progreso.
- Puedes dejarlo corriendo en segundo plano con `nohup ... &` y revisar el
  progreso con los mensajes de log (cada iteracion te dice cuanto tardo).
- Mientras mas simulaciones de MCTS (`MCTS_SIMULATIONS`) y mas partidas por
  iteracion (`GAMES_PER_ITERATION`), mas fuerte se pone la IA — pero mas
  lento es cada ciclo. Si tu maquina es lenta, empieza con numeros mas bajos
  y ve subiendolos.

### Aceleracion opcional (recomendado si tienes tiempo para configurarlo)

Este proyecto usa `@tensorflow/tfjs` puro (sin aceleración nativa) porque en
mi entorno de trabajo no pude instalar `@tensorflow/tfjs-node` (bloqueado por
restricciones de red de mi sandbox). En **tu** computadora, con internet
normal, sí deberías poder instalarlo, y te daría una aceleración muy
significativa (usa código nativo en C++ en vez de JavaScript puro):

```bash
cd packages/ai-training
npm install @tensorflow/tfjs-node
```

Si lo instalas, dime y te ayudo a ajustar el código para que lo use (cambia
un par de imports y simplifica el guardado/carga de modelos, que ya no
necesitaría el truco manual que usamos para evitarlo).

## Paso 4: exportar el modelo entrenado para el navegador

Una vez que el entrenamiento haya avanzado lo suficiente (o en cualquier
punto en que quieras probar el progreso actual):

```bash
cd packages/ai-training
npm run export-model -- checkpoints ../client/public/models/dama144-az
```

Esto crea `packages/client/public/models/dama144-az/model.json` y
`weights.bin` — el juego web los sirve automáticamente como parte del sitio
una vez que hagas `git push` y se redespliegue.

## Paso 5: probar y desplegar

```bash
cd "/home/kolareal2030/Proyecto Dama 144/dama144-project"
git add packages/client/public/models
git commit -m "Agrega modelo de IA neuronal entrenado"
git push
```

En el juego, selecciona el modo **"🧠 Neuronal"** contra la IA. Si el modelo
no existe todavía (no lo has exportado), el juego te avisa claramente con un
mensaje en vez de fallar en silencio.

## Qué tan fuerte va a ser, honestamente

Con los parámetros recomendados de arriba corriendo varios días en una
computadora normal, deberías obtener una IA notablemente más fuerte que la
actual (que usa evaluación escrita a mano), capaz de encontrar tácticas y
planes que un minimax de profundidad fija no ve. Que llegue a ser
**"prácticamente invencible"** al nivel de un AlphaZero real depende
directamente de cuánto tiempo/cómputo le dediques — los proyectos originales
de DeepMind usaban miles de TPUs corriendo semanas. Con una computadora
personal, no vas a igualar eso, pero sí puedes conseguir una IA seria y en
mejora continua, que puedes seguir entrenando indefinidamente (con
`RESUME=1`) cada vez que quieras que suba de nivel.
