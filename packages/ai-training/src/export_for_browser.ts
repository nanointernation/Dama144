import * as fs from 'fs';
import * as path from 'path';

/**
 * Nuestro guardado en disco (modelIO.ts) usa un formato pensado para
 * recargarse en Node via tf.io.fromMemory (weightSpecs sueltos). El
 * navegador, al cargar un modelo por HTTP con tf.loadLayersModel(url),
 * espera el formato ESTANDAR de TensorFlow.js: un "weightsManifest" que
 * apunte a los archivos .bin. Este script convierte de uno a otro.
 *
 * Uso:
 *   node dist/export_for_browser.js <carpeta-checkpoint> <carpeta-destino>
 *
 * Ejemplo:
 *   node dist/export_for_browser.js checkpoints ../client/public/models/dama144-az
 */
function main() {
  const [, , sourceDirArg, destDirArg] = process.argv;
  if (!sourceDirArg || !destDirArg) {
    console.error('Uso: node dist/export_for_browser.js <carpeta-checkpoint> <carpeta-destino>');
    process.exit(1);
  }
  const sourceDir = path.resolve(sourceDirArg);
  const destDir = path.resolve(destDirArg);

  const modelJsonPath = path.join(sourceDir, 'model.json');
  const weightsPath = path.join(sourceDir, 'weights.bin');
  if (!fs.existsSync(modelJsonPath) || !fs.existsSync(weightsPath)) {
    console.error('No se encontro model.json o weights.bin en ' + sourceDir);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));

  const browserFormat = {
    format: raw.format ?? 'layers-model',
    generatedBy: raw.generatedBy ?? 'dama144-ai-training',
    convertedBy: raw.convertedBy ?? null,
    modelTopology: raw.modelTopology,
    weightsManifest: [
      {
        paths: ['weights.bin'],
        weights: raw.weightSpecs,
      },
    ],
  };

  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, 'model.json'), JSON.stringify(browserFormat));
  fs.copyFileSync(weightsPath, path.join(destDir, 'weights.bin'));

  console.log('Modelo exportado para el navegador en:', destDir);
  console.log('Archivos generados: model.json, weights.bin');
}

main();
