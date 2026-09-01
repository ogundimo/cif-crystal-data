Clazz.declarePackage("JS");
(function(){
var c$ = Clazz.decorateAsClass(function(){
this.processName = null;
this.context = null;
Clazz.instantialize(this, arguments);}, JS, "ScriptProcess", null);
Clazz.makeConstructor(c$, 
function(name, context){
this.processName = name;
this.context = context;
}, "~S,JS.ScriptContext");
})();
;//5.0.1-v7 Mon Jul 13 10:25:17 CDT 2026
