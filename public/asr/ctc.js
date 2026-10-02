/** Decode blank-first, Sanskrit-slice CTC output. Blank-separated repeats survive. */
export function decodeCtc(data, dims, vocab) {
  if (dims.length !== 3 || dims[0] !== 1 || dims[2] !== 257 || data.length !== dims[1] * dims[2]) {
    throw new Error('Unexpected Sanskrit model output dimensions.');
  }
  let previous = -1;
  const tokens = [];
  for (let frame = 0; frame < dims[1]; frame++) {
    let best = 0;
    for (let column = 1; column < dims[2]; column++) {
      if (data[frame * dims[2] + column] > data[frame * dims[2] + best]) best = column;
    }
    if (best !== previous && best !== 0) {
      const token = vocab[best];
      if (typeof token !== 'string') throw new Error('Sanskrit vocabulary does not match model output.');
      if (token === '<unk>') throw new Error('The model could not recognize part of this recording.');
      tokens.push(token);
    }
    previous = best;
  }
  return tokens.join('').replace(/▁/g, ' ').replace(/\s+/g, ' ').trim().normalize('NFC');
}
