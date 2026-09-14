interface CifDataBlock {
  name: string;
  text: string;
}

/** Split a physical CIF document into independently importable data_ blocks. */
export function splitCifDataBlocks(text: string): CifDataBlock[] {
  const lines = text.split(/(?<=\n)|(?<=\r)(?!\n)/);
  const starts: Array<{ offset: number; name: string }> = [];
  let offset = 0;
  let inTextBlock = false;
  for (const line of lines) {
    const content = line.replace(/[\r\n]+$/, '');
    if (content.startsWith(';')) inTextBlock = !inTextBlock;
    if (!inTextBlock) {
      const match = content.match(/^\s*data_(\S*)/i);
      if (match) starts.push({ offset, name: match[1] || `block-${starts.length + 1}` });
    }
    offset += line.length;
  }
  if (starts.length <= 1) {
    return [{ name: starts[0]?.name ?? 'block-1', text }];
  }
  return starts.map((start, index) => ({
    name: start.name,
    text: text.slice(start.offset, starts[index + 1]?.offset ?? text.length)
  }));
}
