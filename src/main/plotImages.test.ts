import { expect,it } from 'vitest';
import { encodeTiff,pngWithDpi,jpegWithDpi } from './plotImages';
it('preserves PNG chunk order and encodes 300 dpi as pixels per metre',()=>{
  const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const png=pngWithDpi(original,300);expect(png.toString('ascii',12,16)).toBe('IHDR');expect(png.toString('ascii',37,41)).toBe('pHYs');expect(png.readUInt32BE(41)).toBe(11811);expect(png.subarray(54)).toEqual(original.subarray(33));
});
it('writes TIFF RGB pixels without swapping red and blue',()=>{
  const tiff=encodeTiff(Buffer.from([0,0,255,255,255,0,0,255]),2,1,300);
  expect(tiff.toString('ascii',0,2)).toBe('II');expect([...tiff.subarray(-6)]).toEqual([255,0,0,0,0,255]);
});
it('adds physical-resolution information to JPEG',()=>{
  const jpeg=jpegWithDpi(Buffer.from([255,216,255,217]),300);expect(jpeg.toString('ascii',6,11)).toBe('JFIF\0');expect(jpeg[13]).toBe(1);expect(jpeg.readUInt16BE(14)).toBe(300);expect(jpeg.readUInt16BE(16)).toBe(300);
});
