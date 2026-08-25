import * as tf from '@tensorflow/tfjs';
import * as fs from 'fs';
import * as path from 'path';

export async function saveModelToDisk(model: tf.LayersModel, dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  await model.save(
    tf.io.withSaveHandler(async (artifacts) => {
      const weightData = artifacts.weightData as ArrayBuffer;
      fs.writeFileSync(path.join(dir, 'weights.bin'), Buffer.from(weightData));
      fs.writeFileSync(
        path.join(dir, 'model.json'),
        JSON.stringify(
          {
            modelTopology: artifacts.modelTopology,
            weightSpecs: artifacts.weightSpecs,
            format: artifacts.format,
            generatedBy: artifacts.generatedBy,
            convertedBy: artifacts.convertedBy,
          },
          null,
          2
        )
      );
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    })
  );
}

export function modelExistsOnDisk(dir: string): boolean {
  return fs.existsSync(path.join(dir, 'model.json')) && fs.existsSync(path.join(dir, 'weights.bin'));
}

export async function loadModelFromDisk(dir: string): Promise<tf.LayersModel> {
  const modelJson = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'));
  const weightBuffer = fs.readFileSync(path.join(dir, 'weights.bin'));
  const weightData = weightBuffer.buffer.slice(
    weightBuffer.byteOffset,
    weightBuffer.byteOffset + weightBuffer.byteLength
  );
  const handler = tf.io.fromMemory({
    modelTopology: modelJson.modelTopology,
    weightSpecs: modelJson.weightSpecs,
    weightData,
  });
  return tf.loadLayersModel(handler);
}
