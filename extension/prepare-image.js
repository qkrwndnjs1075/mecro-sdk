function colorMask(pixels, width, height) {
  const distance = (offset, center) => (pixels[offset] - center[0]) ** 2 +
    (pixels[offset + 1] - center[1]) ** 2 + (pixels[offset + 2] - center[2]) ** 2;
  const centers = [Array.from(pixels.slice(0, 3))];
  while (centers.length < 3) {
    let farthest = 0;
    let best = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const nearest = Math.min(...centers.map(center => distance(offset, center)));
      if (nearest > best) {
        best = nearest;
        farthest = offset;
      }
    }
    if (!best) break;
    centers.push(Array.from(pixels.slice(farthest, farthest + 3)));
  }
  const labels = new Uint8Array(width * height);
  for (let iteration = 0; iteration < 20; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    let changed = false;
    for (let index = 0; index < labels.length; index++) {
      const offset = index * 4;
      let nearest = 0;
      for (let cluster = 1; cluster < centers.length; cluster++) {
        if (distance(offset, centers[cluster]) < distance(offset, centers[nearest])) nearest = cluster;
      }
      changed ||= labels[index] !== nearest;
      labels[index] = nearest;
      const sum = sums[nearest];
      for (let channel = 0; channel < 3; channel++) sum[channel] += pixels[offset + channel];
      sum[3]++;
    }
    for (let cluster = 0; cluster < centers.length; cluster++) {
      if (sums[cluster][3]) centers[cluster] = sums[cluster].slice(0, 3).map(value => value / sums[cluster][3]);
    }
    if (!changed) break;
  }
  const counts = centers.map(() => 0);
  for (let index = 0; index < labels.length; index++) {
    counts[labels[index]]++;
  }
  const background = counts.indexOf(Math.max(...counts));
  let selected = new Uint8Array(labels.length);
  let bestScore = -1;
  for (let cluster = 0; cluster < centers.length; cluster++) {
    if (cluster === background) continue;
    const mask = labels.map(label => Number(label === cluster));
    const score = cleanAndScore(mask, width, height);
    if (score > bestScore) {
      bestScore = score;
      selected = mask;
    }
  }
  return selected;
}

function cleanAndScore(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const minimumArea = Math.max(2, Math.round(height * height * 0.0015));
  let score = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const component = [start];
    seen[start] = 1;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const index = component[cursor];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          const next = ny * width + nx;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[next] || !mask[next]) continue;
          seen[next] = 1;
          component.push(next);
        }
      }
    }
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const index of component) {
      const x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (component.length < minimumArea) {
      for (const index of component) mask[index] = 0;
    } else if (maxY - minY + 1 >= height * 0.15 && maxX - minX + 1 < width * 0.5) {
      score += component.length;
    }
  }
  return score;
}

export async function prepareImage(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  const width = canvas.width = image.naturalWidth;
  const height = canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, width, height);
  const mask = colorMask(pixels.data, width, height);
  for (let index = 0; index < mask.length; index++) {
    const value = mask[index] ? 0 : 255;
    pixels.data.set([value, value, value, 255], index * 4);
  }
  context.putImageData(pixels, 0, 0);
  const scale = Math.max(1, Math.min(3, 210 / height));
  const padding = Math.ceil(height * scale * 0.1);
  const output = document.createElement("canvas");
  output.width = Math.ceil(width * scale) + padding * 2;
  output.height = Math.ceil(height * scale) + padding * 2;
  const target = output.getContext("2d");
  target.fillStyle = "white";
  target.fillRect(0, 0, output.width, output.height);
  target.drawImage(canvas, padding, padding, width * scale, height * scale);
  return output;
}
