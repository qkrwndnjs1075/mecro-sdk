import {recognizeImage} from "./recognize-image.js";

export function createImageReader(createWorker, publish) {
  let revision = 0;
  let pending;
  let running = false;
  let worker;

  async function drain() {
    running = true;
    try {
      while (pending) {
        const job = pending;
        pending = undefined;
        try {
          worker ??= await createWorker();
          if (job.revision !== revision) continue;
          const result = await recognizeImage(worker, job.source, () => job.revision === revision);
          if (!result) continue;
          const {data, usable} = result;
          if (job.revision === revision) {
            const text = data.text;
            const status = !text ? "읽을 수 있는 문자·숫자가 없습니다."
              : usable ? "인식 후보입니다. 원본 이미지와 대조해 주세요."
              : "자동 입력을 보류했습니다. 원본 이미지를 확인해 직접 입력해 주세요.";
            publish({text, usable, source: job.source, context: job.context, status});
          }
        } catch (error) {
          if (job.revision === revision) {
            publish({text: "", status: error instanceof Error ? `문자 인식 실패: ${error.message}` : "문자 인식에 실패했습니다."});
          }
          const failedWorker = worker;
          worker = undefined;
          if (failedWorker) {
            try {
              await failedWorker.terminate();
            } catch (cleanupError) {
              if (job.revision === revision) publish({text: "", status: cleanupError instanceof Error ? `OCR 종료 실패: ${cleanupError.message}` : "OCR 종료에 실패했습니다."});
            }
          }
        }
      }
    } finally {
      running = false;
    }
  }

  return (source, context) => {
    revision++;
    pending = source ? {source, context, revision} : undefined;
    publish({text: "", status: source ? "문자·숫자를 읽는 중…" : ""});
    if (pending && !running) void drain();
  };
}
