// Uncompressed RGB TIFF with physical-resolution tags. Electron bitmaps are BGRA on Windows.
export function encodeTiff(bgra:Buffer,width:number,height:number,dpi:number):Buffer {
  if(bgra.length!==width*height*4)throw new Error('Invalid raster buffer.');
  const count=12,bits=8+2+count*12+4,xResolution=bits+6,yResolution=xResolution+8,pixels=yResolution+8;
  const out=Buffer.alloc(pixels+width*height*3);out.write('II');out.writeUInt16LE(42,2);out.writeUInt32LE(8,4);out.writeUInt16LE(count,8);let at=10;
  const entry=(tag:number,type:number,n:number,value:number)=>{out.writeUInt16LE(tag,at);out.writeUInt16LE(type,at+2);out.writeUInt32LE(n,at+4);if(type===3&&n===1)out.writeUInt16LE(value,at+8);else out.writeUInt32LE(value,at+8);at+=12;};
  entry(256,4,1,width);entry(257,4,1,height);entry(258,3,3,bits);entry(259,3,1,1);entry(262,3,1,2);entry(273,4,1,pixels);entry(277,3,1,3);entry(278,4,1,height);entry(279,4,1,width*height*3);entry(282,5,1,xResolution);entry(283,5,1,yResolution);entry(296,3,1,2);
  [0,2,4].forEach(i=>out.writeUInt16LE(8,bits+i));for(const offset of [xResolution,yResolution]){out.writeUInt32LE(dpi,offset);out.writeUInt32LE(1,offset+4);}
  for(let i=0,j=pixels;i<bgra.length;i+=4,j+=3){out[j]=bgra[i+2];out[j+1]=bgra[i+1];out[j+2]=bgra[i];}return out;
}
function crc32(buffer:Buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
export function pngWithDpi(png:Buffer,dpi:number):Buffer {
  const chunk=Buffer.alloc(21);chunk.writeUInt32BE(9);chunk.write('pHYs',4);chunk.writeUInt32BE(Math.round(dpi/.0254),8);chunk.writeUInt32BE(Math.round(dpi/.0254),12);chunk[16]=1;chunk.writeUInt32BE(crc32(chunk.subarray(4,17)),17);
  // IHDR must remain the first PNG chunk.
  const pieces=[png.subarray(0,33),chunk];let offset=33;
  while(offset<png.length){const length=png.readUInt32BE(offset)+12;if(png.toString('ascii',offset+4,offset+8)!=='pHYs')pieces.push(png.subarray(offset,offset+length));offset+=length;}return Buffer.concat(pieces);
}
export function jpegWithDpi(jpeg:Buffer,dpi:number):Buffer {
  if(jpeg[2]===0xff&&jpeg[3]===0xe0&&jpeg.toString('ascii',6,11)==='JFIF\0'){const out=Buffer.from(jpeg);out[13]=1;out.writeUInt16BE(dpi,14);out.writeUInt16BE(dpi,16);return out;}
  const jfif=Buffer.from([0xff,0xe0,0,16,74,70,73,70,0,1,1,1,0,0,0,0,0,0]);jfif.writeUInt16BE(dpi,12);jfif.writeUInt16BE(dpi,14);return Buffer.concat([jpeg.subarray(0,2),jfif,jpeg.subarray(2)]);
}
