const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync('public/usb-printer.js').toString('base64'));
test('connection checks exclusive access before saving printer and closes on failure',async()=>{
 const {connectPrinter,usbConfigured}=await modulePromise;
 const values=new Map();let closed=false;
 const device={opened:false,configurations:[{configurationValue:1,interfaces:[{interfaceNumber:0,alternates:[{alternateSetting:0,interfaceClass:7,endpoints:[{direction:'out',type:'bulk',endpointNumber:1}]}]}]}],
  async open(){this.opened=true;},async close(){closed=true;this.opened=false;},
  async selectConfiguration(){this.configuration=this.configurations[0];},
  async claimInterface(){throw new Error('Unable to claim interface');}};
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 globalThis.window={isSecureContext:true};
 globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{usb:{requestDevice:async()=>device}}});
 try{
  await assert.rejects(connectPrinter(),/Chrome thấy máy in/);
  assert.equal(closed,true);assert.equal(usbConfigured(),false);
  device.claimInterface=async()=>{};device.selectAlternateInterface=async()=>{};device.releaseInterface=async()=>{};
  await connectPrinter();assert.equal(usbConfigured(),true);assert.equal(device.opened,false);
 }finally{
  delete globalThis.window;delete globalThis.localStorage;
  if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
 }
});
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
