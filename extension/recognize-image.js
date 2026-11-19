export async function recognizeImage(worker, source, isCurrent = () => true) {
  if (!isCurrent()) return;
  if (!source) return {data: {text: "", confidence: 0}, usable: false};
  const {data} = await worker.recognize(source);
  if (!isCurrent()) return;
  const text = data.text.trim();
  return {data: {...data, text: text.toUpperCase()}, usable: /^[A-Za-z0-9]+$/.test(text)};
}
