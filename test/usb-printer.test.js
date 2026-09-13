const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('public/usb-printer.js').toString('base64'));
test('raster packs black pixels MSB first and pads partial bytes',async()=>{
 const {rasterPacket}=await modulePromise;
 const rgba=new Uint8Array(9*4).fill(255);
 for(const x of [0,7,8])rgba.set([0,0,0,255],x*4);
 assert.deepEqual([...rasterPacket(rgba,9,1)],[29,118,48,0,2,0,1,0,129,128]);
});
test('USB descriptor selection uses actual configuration and alternate endpoint',async()=>{
 const {printerEndpoint}=await modulePromise;
 const device={configurations:[{configurationValue:2,interfaces:[{interfaceNumber:3,alternates:[{alternateSetting:1,interfaceClass:7,endpoints:[{direction:'in',type:'bulk',endpointNumber:1},{direction:'out',type:'bulk',endpointNumber:4}]}]}]}]};
 assert.deepEqual(printerEndpoint(device),{config:2,iface:3,alt:1,endpoint:4});
 assert.throws(()=>printerEndpoint({configurations:[]}),/USB/);
});
