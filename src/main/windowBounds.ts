import { BrowserWindow,screen } from 'electron';

export function screenWindowBounds(width:number,height:number,minWidth:number,minHeight:number,parent?:BrowserWindow|null) {
  const area=(parent?screen.getDisplayMatching(parent.getBounds()):screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea;
  width=Math.min(width,area.width);height=Math.min(height,area.height);
  return {x:area.x+Math.floor((area.width-width)/2),y:area.y+Math.floor((area.height-height)/2),width,height,minWidth:Math.min(minWidth,area.width),minHeight:Math.min(minHeight,area.height),maxWidth:area.width,maxHeight:area.height};
}

export function keepWindowOnScreen(win:BrowserWindow,minWidth:number,minHeight:number) {
  let adjusting=false;
  const constrain=()=>{
    if(win.isDestroyed()||adjusting)return;
    adjusting=true;
    try {
      const b=win.getBounds(),a=screen.getDisplayMatching(b).workArea;
      win.setMinimumSize(Math.min(minWidth,a.width),Math.min(minHeight,a.height));win.setMaximumSize(a.width,a.height);
      const width=Math.min(b.width,a.width),height=Math.min(b.height,a.height);
      const next={x:Math.max(a.x,Math.min(b.x,a.x+a.width-width)),y:Math.max(a.y,Math.min(b.y,a.y+a.height-height)),width,height};
      if(Object.keys(next).some(k=>next[k as keyof typeof next]!==b[k as keyof typeof b]))win.setBounds(next);
    } finally {adjusting=false;}
  };
  win.on('resize',constrain);win.on('move',constrain);
  screen.on('display-metrics-changed',constrain);screen.on('display-removed',constrain);
  win.on('closed',()=>{screen.removeListener('display-metrics-changed',constrain);screen.removeListener('display-removed',constrain);});
}
