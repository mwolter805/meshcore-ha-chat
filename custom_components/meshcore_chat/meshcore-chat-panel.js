function e(e,t,i,o){var r,s=arguments.length,a=s<3?t:null===o?o=Object.getOwnPropertyDescriptor(t,i):o;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)a=Reflect.decorate(e,t,i,o);else for(var n=e.length-1;n>=0;n--)(r=e[n])&&(a=(s<3?r(a):s>3?r(t,i,a):r(t,i))||a);return s>3&&a&&Object.defineProperty(t,i,a),a}"function"==typeof SuppressedError&&SuppressedError;const t=globalThis,i=t.ShadowRoot&&(void 0===t.ShadyCSS||t.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,o=Symbol(),r=new WeakMap;let s=class{constructor(e,t,i){if(this._$cssResult$=!0,i!==o)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(i&&void 0===e){const i=void 0!==t&&1===t.length;i&&(e=r.get(t)),void 0===e&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&r.set(t,e))}return e}toString(){return this.cssText}};const a=(e,...t)=>{const i=1===e.length?e[0]:t.reduce((t,i,o)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw Error("Value passed to 'css' function must be a 'css' function result: "+e+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+e[o+1],e[0]);return new s(i,e,o)},n=i?e=>e:e=>e instanceof CSSStyleSheet?(e=>{let t="";for(const i of e.cssRules)t+=i.cssText;return(e=>new s("string"==typeof e?e:e+"",void 0,o))(t)})(e):e,{is:c,defineProperty:d,getOwnPropertyDescriptor:l,getOwnPropertyNames:p,getOwnPropertySymbols:h,getPrototypeOf:g}=Object,m=globalThis,u=m.trustedTypes,v=u?u.emptyScript:"",f=m.reactiveElementPolyfillSupport,y=(e,t)=>e,b={toAttribute(e,t){switch(t){case Boolean:e=e?v:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let i=e;switch(t){case Boolean:i=null!==e;break;case Number:i=null===e?null:Number(e);break;case Object:case Array:try{i=JSON.parse(e)}catch(e){i=null}}return i}},_=(e,t)=>!c(e,t),x={attribute:!0,type:String,converter:b,reflect:!1,useDefault:!1,hasChanged:_};Symbol.metadata??=Symbol("metadata"),m.litPropertyMetadata??=new WeakMap;let w=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=x){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const i=Symbol(),o=this.getPropertyDescriptor(e,i,t);void 0!==o&&d(this.prototype,e,o)}}static getPropertyDescriptor(e,t,i){const{get:o,set:r}=l(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};return{get:o,set(t){const s=o?.call(this);r?.call(this,t),this.requestUpdate(e,s,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??x}static _$Ei(){if(this.hasOwnProperty(y("elementProperties")))return;const e=g(this);e.finalize(),void 0!==e.l&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(y("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(y("properties"))){const e=this.properties,t=[...p(e),...h(e)];for(const i of t)this.createProperty(i,e[i])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,i]of t)this.elementProperties.set(e,i)}this._$Eh=new Map;for(const[e,t]of this.elementProperties){const i=this._$Eu(e,t);void 0!==i&&this._$Eh.set(i,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const i=new Set(e.flat(1/0).reverse());for(const e of i)t.unshift(n(e))}else void 0!==e&&t.push(n(e));return t}static _$Eu(e,t){const i=t.attribute;return!1===i?void 0:"string"==typeof i?i:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),void 0!==this.renderRoot&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const i of t.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((e,o)=>{if(i)e.adoptedStyleSheets=o.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const i of o){const o=document.createElement("style"),r=t.litNonce;void 0!==r&&o.setAttribute("nonce",r),o.textContent=i.cssText,e.appendChild(o)}})(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,i){this._$AK(e,i)}_$ET(e,t){const i=this.constructor.elementProperties.get(e),o=this.constructor._$Eu(e,i);if(void 0!==o&&!0===i.reflect){const r=(void 0!==i.converter?.toAttribute?i.converter:b).toAttribute(t,i.type);this._$Em=e,null==r?this.removeAttribute(o):this.setAttribute(o,r),this._$Em=null}}_$AK(e,t){const i=this.constructor,o=i._$Eh.get(e);if(void 0!==o&&this._$Em!==o){const e=i.getPropertyOptions(o),r="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==e.converter?.fromAttribute?e.converter:b;this._$Em=o;const s=r.fromAttribute(t,e.type);this[o]=s??this._$Ej?.get(o)??s,this._$Em=null}}requestUpdate(e,t,i,o=!1,r){if(void 0!==e){const s=this.constructor;if(!1===o&&(r=this[e]),i??=s.getPropertyOptions(e),!((i.hasChanged??_)(r,t)||i.useDefault&&i.reflect&&r===this._$Ej?.get(e)&&!this.hasAttribute(s._$Eu(e,i))))return;this.C(e,t,i)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(e,t,{useDefault:i,reflect:o,wrapped:r},s){i&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,s??t??this[e]),!0!==r||void 0!==s)||(this._$AL.has(e)||(this.hasUpdated||i||(t=void 0),this._$AL.set(e,t)),!0===o&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[e,t]of this._$Ep)this[e]=t;this._$Ep=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,i]of e){const{wrapped:e}=i,o=this[t];!0!==e||this._$AL.has(t)||void 0===o||this.C(t,void 0,i,o)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(e=>e.hostUpdate?.()),this.update(t)):this._$EM()}catch(t){throw e=!1,this._$EM(),t}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(e=>this._$ET(e,this[e])),this._$EM()}updated(e){}firstUpdated(e){}};w.elementStyles=[],w.shadowRootOptions={mode:"open"},w[y("elementProperties")]=new Map,w[y("finalized")]=new Map,f?.({ReactiveElement:w}),(m.reactiveElementVersions??=[]).push("2.1.2");const $=globalThis,k=e=>e,C=$.trustedTypes,S=C?C.createPolicy("lit-html",{createHTML:e=>e}):void 0,M="$lit$",z=`lit$${Math.random().toFixed(9).slice(2)}$`,A="?"+z,D=`<${A}>`,O=document,I=()=>O.createComment(""),E=e=>null===e||"object"!=typeof e&&"function"!=typeof e,T=Array.isArray,R="[ \t\n\f\r]",F=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,N=/-->/g,L=/>/g,q=RegExp(`>|${R}(?:([^\\s"'>=/]+)(${R}*=${R}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),P=/'/g,H=/"/g,B=/^(?:script|style|textarea|title)$/i,V=e=>(t,...i)=>({_$litType$:e,strings:t,values:i}),j=V(1),K=V(2),U=Symbol.for("lit-noChange"),W=Symbol.for("lit-nothing"),G=new WeakMap,X=O.createTreeWalker(O,129);function Q(e,t){if(!T(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==S?S.createHTML(t):t}const Y=(e,t)=>{const i=e.length-1,o=[];let r,s=2===t?"<svg>":3===t?"<math>":"",a=F;for(let t=0;t<i;t++){const i=e[t];let n,c,d=-1,l=0;for(;l<i.length&&(a.lastIndex=l,c=a.exec(i),null!==c);)l=a.lastIndex,a===F?"!--"===c[1]?a=N:void 0!==c[1]?a=L:void 0!==c[2]?(B.test(c[2])&&(r=RegExp("</"+c[2],"g")),a=q):void 0!==c[3]&&(a=q):a===q?">"===c[0]?(a=r??F,d=-1):void 0===c[1]?d=-2:(d=a.lastIndex-c[2].length,n=c[1],a=void 0===c[3]?q:'"'===c[3]?H:P):a===H||a===P?a=q:a===N||a===L?a=F:(a=q,r=void 0);const p=a===q&&e[t+1].startsWith("/>")?" ":"";s+=a===F?i+D:d>=0?(o.push(n),i.slice(0,d)+M+i.slice(d)+z+p):i+z+(-2===d?t:p)}return[Q(e,s+(e[i]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),o]};class J{constructor({strings:e,_$litType$:t},i){let o;this.parts=[];let r=0,s=0;const a=e.length-1,n=this.parts,[c,d]=Y(e,t);if(this.el=J.createElement(c,i),X.currentNode=this.el.content,2===t||3===t){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(o=X.nextNode())&&n.length<a;){if(1===o.nodeType){if(o.hasAttributes())for(const e of o.getAttributeNames())if(e.endsWith(M)){const t=d[s++],i=o.getAttribute(e).split(z),a=/([.?@])?(.*)/.exec(t);n.push({type:1,index:r,name:a[2],strings:i,ctor:"."===a[1]?oe:"?"===a[1]?re:"@"===a[1]?se:ie}),o.removeAttribute(e)}else e.startsWith(z)&&(n.push({type:6,index:r}),o.removeAttribute(e));if(B.test(o.tagName)){const e=o.textContent.split(z),t=e.length-1;if(t>0){o.textContent=C?C.emptyScript:"";for(let i=0;i<t;i++)o.append(e[i],I()),X.nextNode(),n.push({type:2,index:++r});o.append(e[t],I())}}}else if(8===o.nodeType)if(o.data===A)n.push({type:2,index:r});else{let e=-1;for(;-1!==(e=o.data.indexOf(z,e+1));)n.push({type:7,index:r}),e+=z.length-1}r++}}static createElement(e,t){const i=O.createElement("template");return i.innerHTML=e,i}}function Z(e,t,i=e,o){if(t===U)return t;let r=void 0!==o?i._$Co?.[o]:i._$Cl;const s=E(t)?void 0:t._$litDirective$;return r?.constructor!==s&&(r?._$AO?.(!1),void 0===s?r=void 0:(r=new s(e),r._$AT(e,i,o)),void 0!==o?(i._$Co??=[])[o]=r:i._$Cl=r),void 0!==r&&(t=Z(e,r._$AS(e,t.values),r,o)),t}class ee{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:i}=this._$AD,o=(e?.creationScope??O).importNode(t,!0);X.currentNode=o;let r=X.nextNode(),s=0,a=0,n=i[0];for(;void 0!==n;){if(s===n.index){let t;2===n.type?t=new te(r,r.nextSibling,this,e):1===n.type?t=new n.ctor(r,n.name,n.strings,this,e):6===n.type&&(t=new ae(r,this,e)),this._$AV.push(t),n=i[++a]}s!==n?.index&&(r=X.nextNode(),s++)}return X.currentNode=O,o}p(e){let t=0;for(const i of this._$AV)void 0!==i&&(void 0!==i.strings?(i._$AI(e,i,t),t+=i.strings.length-2):i._$AI(e[t])),t++}}class te{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,i,o){this.type=2,this._$AH=W,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=i,this.options=o,this._$Cv=o?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return void 0!==t&&11===e?.nodeType&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=Z(this,e,t),E(e)?e===W||null==e||""===e?(this._$AH!==W&&this._$AR(),this._$AH=W):e!==this._$AH&&e!==U&&this._(e):void 0!==e._$litType$?this.$(e):void 0!==e.nodeType?this.T(e):(e=>T(e)||"function"==typeof e?.[Symbol.iterator])(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==W&&E(this._$AH)?this._$AA.nextSibling.data=e:this.T(O.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:i}=e,o="number"==typeof i?this._$AC(e):(void 0===i.el&&(i.el=J.createElement(Q(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===o)this._$AH.p(t);else{const e=new ee(o,this),i=e.u(this.options);e.p(t),this.T(i),this._$AH=e}}_$AC(e){let t=G.get(e.strings);return void 0===t&&G.set(e.strings,t=new J(e)),t}k(e){T(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let i,o=0;for(const r of e)o===t.length?t.push(i=new te(this.O(I()),this.O(I()),this,this.options)):i=t[o],i._$AI(r),o++;o<t.length&&(this._$AR(i&&i._$AB.nextSibling,o),t.length=o)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const t=k(e).nextSibling;k(e).remove(),e=t}}setConnected(e){void 0===this._$AM&&(this._$Cv=e,this._$AP?.(e))}}class ie{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,i,o,r){this.type=1,this._$AH=W,this._$AN=void 0,this.element=e,this.name=t,this._$AM=o,this.options=r,i.length>2||""!==i[0]||""!==i[1]?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=W}_$AI(e,t=this,i,o){const r=this.strings;let s=!1;if(void 0===r)e=Z(this,e,t,0),s=!E(e)||e!==this._$AH&&e!==U,s&&(this._$AH=e);else{const o=e;let a,n;for(e=r[0],a=0;a<r.length-1;a++)n=Z(this,o[i+a],t,a),n===U&&(n=this._$AH[a]),s||=!E(n)||n!==this._$AH[a],n===W?e=W:e!==W&&(e+=(n??"")+r[a+1]),this._$AH[a]=n}s&&!o&&this.j(e)}j(e){e===W?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class oe extends ie{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===W?void 0:e}}class re extends ie{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==W)}}class se extends ie{constructor(e,t,i,o,r){super(e,t,i,o,r),this.type=5}_$AI(e,t=this){if((e=Z(this,e,t,0)??W)===U)return;const i=this._$AH,o=e===W&&i!==W||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,r=e!==W&&(i===W||o);o&&this.element.removeEventListener(this.name,this,i),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class ae{constructor(e,t,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){Z(this,e)}}const ne=$.litHtmlPolyfillSupport;ne?.(J,te),($.litHtmlVersions??=[]).push("3.3.2");const ce=globalThis;let de=class extends w{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=((e,t,i)=>{const o=i?.renderBefore??t;let r=o._$litPart$;if(void 0===r){const e=i?.renderBefore??null;o._$litPart$=r=new te(t.insertBefore(I(),e),e,void 0,i??{})}return r._$AI(e),r})(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return U}};de._$litElement$=!0,de.finalized=!0,ce.litElementHydrateSupport?.({LitElement:de});const le=ce.litElementPolyfillSupport;le?.({LitElement:de}),(ce.litElementVersions??=[]).push("4.2.2");const pe=e=>(t,i)=>{void 0!==i?i.addInitializer(()=>{customElements.define(e,t)}):customElements.define(e,t)},he={attribute:!0,type:String,converter:b,reflect:!1,hasChanged:_},ge=(e=he,t,i)=>{const{kind:o,metadata:r}=i;let s=globalThis.litPropertyMetadata.get(r);if(void 0===s&&globalThis.litPropertyMetadata.set(r,s=new Map),"setter"===o&&((e=Object.create(e)).wrapped=!0),s.set(i.name,e),"accessor"===o){const{name:o}=i;return{set(i){const r=t.get.call(this);t.set.call(this,i),this.requestUpdate(o,r,e,!0,i)},init(t){return void 0!==t&&this.C(o,void 0,e,t),t}}}if("setter"===o){const{name:o}=i;return function(i){const r=this[o];t.call(this,i),this.requestUpdate(o,r,e,!0,i)}}throw Error("Unsupported decorator location: "+o)};function me(e){return(t,i)=>"object"==typeof i?ge(e,t,i):((e,t,i)=>{const o=t.hasOwnProperty(i);return t.constructor.createProperty(i,e),o?Object.getOwnPropertyDescriptor(t,i):void 0})(e,t,i)}function ue(e){return me({...e,state:!0,attribute:!1})}const ve=a`
  :host {
    display: block;
    width: 100%;
    height: 100vh;
    --chat-bg: var(--chat-card-bg, var(--card-background-color, #fff));
    --bubble-incoming-bg: var(
      --chat-card-bubble-incoming-bg,
      var(--secondary-background-color, #e8e8e8)
    );
    --bubble-outgoing-bg: var(--chat-card-bubble-outgoing-bg, var(--primary-color, #03a9f4));
    --bubble-incoming-text: var(
      --chat-card-bubble-incoming-text,
      var(--primary-text-color, #212121)
    );
    --bubble-outgoing-text: var(--chat-card-bubble-outgoing-text, #fff);
    --sender-color: var(--chat-card-sender-color, var(--primary-color, #03a9f4));
    --timestamp-color: var(--chat-card-timestamp-color, var(--secondary-text-color, #727272));
    --mention-bg: var(--chat-card-mention-bg, rgba(3, 169, 244, 0.15));
    --mention-text: var(--chat-card-mention-text, var(--primary-color, #03a9f4));
    --date-separator-color: var(
      --chat-card-date-separator-color,
      var(--secondary-text-color, #727272)
    );
    --unread-badge-bg: var(--chat-card-unread-badge-bg, var(--primary-color, #03a9f4));
    --input-bg: var(--chat-card-input-bg, var(--card-background-color, #fff));
    --input-border: var(--chat-card-input-border, var(--divider-color, #e0e0e0));
    --scrollbar-thumb: var(--chat-card-scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
    --system-msg-color: var(--chat-card-system-msg-color, var(--secondary-text-color, #727272));
    --error-color: var(--error-color, #db4437);
  }

  /* === Panel Layout === */
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--primary-background-color, #fafafa);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--card-background-color, #fff);
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    flex-shrink: 0;
    gap: 12px;
  }

  .panel-title {
    font-size: 18px;
    font-weight: 500;
    color: var(--primary-text-color);
    flex: 1;
  }

  .device-switcher {
    padding: 8px 12px;
    border: 1px solid var(--input-border);
    border-radius: 8px;
    background: var(--input-bg);
    color: var(--primary-text-color);
    font-size: 13px;
    box-sizing: border-box;
    height: 39px;
    min-height: 39px;
    line-height: normal;
    appearance: menulist;
    -webkit-appearance: menulist;
    cursor: pointer;
  }

  /* === Tab Bar === */
  .tab-bar {
    display: flex;
    gap: 0;
    padding: 0;
    background: var(--card-background-color, #fff);
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    flex-shrink: 0;
  }

  .tab-bar button {
    flex: 1;
    padding: 12px 16px;
    border: none;
    background: transparent;
    color: var(--secondary-text-color, #727272);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border-bottom: 3px solid transparent;
    min-height: 48px;
  }

  .tab-bar button:hover {
    color: var(--primary-text-color);
    background: rgba(0, 0, 0, 0.02);
  }

  .tab-bar button.active {
    color: var(--primary-color, #03a9f4);
    border-bottom-color: var(--primary-color, #03a9f4);
  }

  /* === Page Container === */
  .page-container {
    flex: 1;
    overflow: hidden;
    display: flex;
  }

  .page {
    display: none;
    flex: 1;
    overflow: hidden;
  }

  .page.active {
    display: flex;
  }

  /* === Chat Page (with sidebar) === */
  .chat-layout {
    display: flex;
    width: 100%;
    height: 100%;
    gap: 0;
  }

  /* === Message Bubble Styles === */
  .bubble {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 16px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    position: relative;
    cursor: pointer;
    transition: opacity 0.15s;
    line-height: 1.4;
    font-size: 14px;
  }

  .bubble:active {
    opacity: 0.7;
  }

  .bubble + .bubble {
    margin-top: 2px;
  }

  .bubble.incoming {
    background: var(--bubble-incoming-bg);
    color: var(--bubble-incoming-text);
    border-bottom-left-radius: 4px;
  }

  .bubble.incoming:first-of-type {
    border-top-left-radius: 16px;
  }

  .bubble.outgoing {
    background: var(--bubble-outgoing-bg);
    color: var(--bubble-outgoing-text);
    border-bottom-right-radius: 4px;
  }

  .bubble.outgoing:first-of-type {
    border-top-right-radius: 16px;
  }

  .bubble.system {
    background: transparent;
    color: var(--system-msg-color);
    font-style: italic;
    font-size: 13px;
    text-align: center;
    cursor: default;
    padding: 4px 12px;
  }

  .message-text {
    white-space: pre-wrap;
  }

  .message-text .mention {
    background: var(--mention-bg);
    color: var(--mention-text);
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 4px;
  }

  .bubble.outgoing .message-text .mention {
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
  }

  .timestamp {
    font-size: 11px;
    color: var(--timestamp-color);
    margin-top: 2px;
    padding: 0 4px;
    opacity: 0.8;
  }

  /* === Sender Label === */
  .sender {
    font-size: 12px;
    font-weight: 600;
    color: var(--sender-color);
    margin-bottom: 2px;
    padding: 0 4px;
    max-width: 85%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* === Message Group === */
  .message-group {
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
  }

  .message-group.outgoing {
    align-items: flex-end;
  }

  .message-group.incoming {
    align-items: flex-start;
  }

  .message-group.system {
    align-items: center;
  }

  /* === Date Separator === */
  .date-separator {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0 12px;
    color: var(--date-separator-color);
    font-size: 12px;
    font-weight: 500;
  }

  .date-separator::before,
  .date-separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--divider-color, #e0e0e0);
  }

  /* === Contact Card === */
  .contact-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    cursor: pointer;
    transition: background 0.15s;
  }

  .contact-card:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  .contact-card.active {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    border-left: 3px solid var(--primary-color, #03a9f4);
  }

  .contact-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--primary-color, #03a9f4);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
  }

  .contact-info {
    flex: 1;
    overflow: hidden;
  }

  .contact-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--primary-text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contact-prefix {
    font-size: 12px;
    color: var(--secondary-text-color);
    font-family: monospace;
  }

  .contact-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .contact-status.online {
    background: #4caf50;
  }

  .contact-status.offline {
    background: var(--secondary-text-color);
  }

  /* === Conversation Sidebar === */
  .conversation-sidebar {
    width: 280px;
    border-right: 1px solid var(--divider-color, #e0e0e0);
    display: flex;
    flex-direction: column;
    background: var(--card-background-color, #fff);
    flex-shrink: 0;
  }

  .sidebar-search {
    padding: 12px;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }

  .sidebar-search input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--input-border);
    border-radius: 20px;
    background: var(--input-bg);
    color: var(--primary-text-color);
    font-size: 13px;
    outline: none;
  }

  .sidebar-search input:focus {
    border-color: var(--primary-color);
  }

  .conversation-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .conversation-list::-webkit-scrollbar {
    width: 6px;
  }

  .conversation-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .conversation-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  /* === Chat Container === */
  .chat-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 12px;
    background: var(--chat-bg);
    position: relative;
  }

  .chat-container::-webkit-scrollbar {
    width: 6px;
  }

  .chat-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-container::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  /* === Input Area === */
  .input-area {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 8px 12px 12px;
    border-top: 1px solid var(--divider-color, #e0e0e0);
    background: var(--input-bg);
    flex-shrink: 0;
  }

  .input-area textarea {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--input-border);
    border-radius: 20px;
    background: var(--chat-bg);
    color: var(--primary-text-color);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    outline: none;
    max-height: 120px;
    min-height: 40px;
    line-height: 1.4;
    transition: border-color 0.2s;
  }

  .input-area textarea:focus {
    border-color: var(--primary-color);
  }

  .input-area textarea::placeholder {
    color: var(--timestamp-color);
  }

  .input-area textarea:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: var(--primary-color, #03a9f4);
    color: #fff;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s, transform 0.15s;
  }

  .send-button:hover {
    opacity: 0.9;
  }

  .send-button:active {
    transform: scale(0.95);
  }

  .send-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-button svg {
    width: 20px;
    height: 20px;
  }

  /* === Empty State === */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: var(--secondary-text-color);
    text-align: center;
  }

  .empty-state .empty-icon {
    font-size: 32px;
    margin-bottom: 8px;
    opacity: 0.5;
  }

  .empty-state .empty-text {
    font-size: 14px;
  }

  /* === Loading State === */
  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    color: var(--secondary-text-color);
    font-size: 14px;
    gap: 8px;
  }

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--divider-color, #e0e0e0);
    border-top-color: var(--primary-color, #03a9f4);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* === Error State === */
  .error-state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    color: var(--error-color);
    font-size: 13px;
    background: rgba(219, 68, 55, 0.08);
    border-radius: 8px;
    margin: 8px 12px;
  }

  /* === Delivery Status === */
  .delivery-status {
    font-size: 11px;
    color: var(--timestamp-color);
    margin-top: 2px;
    padding: 0 4px;
    opacity: 0.8;
  }

  .delivery-waiting {
    color: var(--timestamp-color);
  }

  .delivery-sent {
    color: var(--primary-color, #03a9f4);
  }

  .delivery-delivered {
    color: #4caf50;
  }

  .delivery-failed {
    color: var(--error-color, #db4437);
  }

  /* === Route Info Inline === */
  .route-info-inline {
    font-size: 11px;
    color: var(--timestamp-color);
    font-family: monospace;
    margin-top: 2px;
    padding: 0 4px;
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* === Device Cards === */
  .device-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 8px;
    background: var(--card-background-color, #fff);
    cursor: pointer;
    transition: all 0.15s;
  }

  .device-card:hover {
    background: rgba(0, 0, 0, 0.02);
    border-color: var(--primary-color, #03a9f4);
  }

  .device-card.active {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    border-color: var(--primary-color, #03a9f4);
  }

  .device-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .device-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--primary-text-color);
  }

  .device-type {
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
    color: var(--primary-color, #03a9f4);
    font-weight: 500;
  }

  .device-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .device-stat {
    font-size: 12px;
    color: var(--secondary-text-color);
  }

  .device-stat-label {
    font-weight: 500;
    color: var(--primary-text-color);
  }

  .device-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }

  .device-action-btn {
    padding: 6px 10px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 4px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .device-action-btn:hover {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    border-color: var(--primary-color, #03a9f4);
    color: var(--primary-color, #03a9f4);
  }

  .device-action-btn:active {
    transform: scale(0.98);
  }

  /* === Settings Page === */
  .settings-section {
    padding: 16px;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    padding: 12px 0;
    user-select: none;
  }

  .settings-header:hover {
    color: var(--primary-color, #03a9f4);
  }

  .settings-header-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--primary-text-color);
  }

  .settings-header-icon {
    font-size: 18px;
    transition: transform 0.2s;
  }

  .settings-header.collapsed .settings-header-icon {
    transform: rotate(-90deg);
  }

  .settings-content {
    display: none;
    padding: 12px 0;
  }

  .settings-content.expanded {
    display: block;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group:last-child {
    margin-bottom: 0;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--primary-text-color);
    margin-bottom: 6px;
  }

  .form-label.required::after {
    content: ' *';
    color: var(--error-color, #db4437);
  }

  .form-input,
  .form-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--primary-text-color);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .form-select {
    height: 39px;
    min-height: 39px;
    line-height: normal;
    appearance: menulist;
    -webkit-appearance: menulist;
  }

  .form-input:focus,
  .form-select:focus {
    border-color: var(--primary-color, #03a9f4);
  }

  .form-input:disabled,
  .form-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .form-toggle input[type='checkbox'] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .form-toggle-label {
    font-size: 13px;
    color: var(--primary-text-color);
    cursor: pointer;
  }

  .form-description {
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-top: 4px;
  }

  .apply-button {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    background: var(--primary-color, #03a9f4);
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .apply-button:hover {
    opacity: 0.9;
  }

  .apply-button:active {
    transform: scale(0.98);
  }

  .apply-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* === Dialog Components === */
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 16px;
  }

  .dialog {
    display: flex;
    flex-direction: column;
    max-width: 500px;
    width: 100%;
    max-height: 80vh;
    border-radius: 12px;
    background: var(--card-background-color, #fff);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .dialog-header {
    padding: 16px;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    flex-shrink: 0;
  }

  .dialog-header-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--primary-text-color);
  }

  .dialog-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .dialog-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 16px;
    border-top: 1px solid var(--divider-color, #e0e0e0);
    flex-shrink: 0;
  }

  .dialog-button {
    padding: 8px 16px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 6px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .dialog-button:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  .dialog-button.primary {
    background: var(--primary-color, #03a9f4);
    color: #fff;
    border-color: var(--primary-color, #03a9f4);
  }

  .dialog-button.primary:hover {
    opacity: 0.9;
  }

  /* === Command Dialog === */
  .command-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--input-border);
    border-radius: 6px;
    background: var(--input-bg);
    color: var(--primary-text-color);
    font-size: 13px;
    outline: none;
    box-sizing: border-box;
    height: 39px;
    min-height: 39px;
    line-height: normal;
    appearance: menulist;
    -webkit-appearance: menulist;
  }

  .command-description {
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-top: 8px;
    padding: 8px;
    border-left: 2px solid var(--primary-color, #03a9f4);
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.05);
    border-radius: 4px;
  }

  .command-params {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--divider-color, #e0e0e0);
  }

  .command-response {
    font-size: 12px;
    font-family: monospace;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 6px;
    padding: 12px;
    margin-top: 12px;
    white-space: pre-wrap;
    word-wrap: break-word;
    max-height: 200px;
    overflow-y: auto;
    color: var(--primary-text-color);
  }

  /* === Channel Management === */
  .channel-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .channel-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 6px;
    background: var(--card-background-color, #fff);
    transition: all 0.15s;
  }

  .channel-item:hover {
    background: rgba(0, 0, 0, 0.02);
    border-color: var(--primary-color, #03a9f4);
  }

  .channel-item-info {
    flex: 1;
  }

  .channel-item-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--primary-text-color);
  }

  .channel-item-idx {
    font-size: 12px;
    color: var(--secondary-text-color);
    font-family: monospace;
  }

  .channel-item-actions {
    display: flex;
    gap: 6px;
  }

  .channel-action-btn {
    padding: 6px 10px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 4px;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .channel-action-btn:hover {
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
    border-color: var(--primary-color, #03a9f4);
    color: var(--primary-color, #03a9f4);
  }

  .channel-add-button {
    padding: 10px 16px;
    border: 2px dashed var(--divider-color, #e0e0e0);
    border-radius: 6px;
    background: transparent;
    color: var(--primary-color, #03a9f4);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .channel-add-button:hover {
    border-color: var(--primary-color, #03a9f4);
    background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.05);
  }

  /* === Danger Zone === */
  .danger-zone {
    padding: 12px;
    border: 2px solid var(--error-color, #db4437);
    border-radius: 8px;
    background: rgba(219, 68, 55, 0.05);
  }

  .danger-zone-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--error-color, #db4437);
    margin-bottom: 8px;
  }

  .danger-button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: var(--error-color, #db4437);
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .danger-button:hover {
    opacity: 0.9;
  }

  .danger-button:active {
    transform: scale(0.98);
  }

  .danger-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* === Neighbor Info === */
  .neighbor-chart-container {
    width: 100%;
    height: 300px;
    border: 1px solid var(--divider-color, #e0e0e0);
    border-radius: 8px;
    background: var(--input-bg);
  }

  .neighbor-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 12px;
  }

  .neighbor-table th {
    padding: 10px 12px;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-text-color);
    border-bottom: 2px solid var(--divider-color, #e0e0e0);
    background: rgba(0, 0, 0, 0.02);
  }

  .neighbor-table td {
    padding: 10px 12px;
    font-size: 12px;
    color: var(--primary-text-color);
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }

  .neighbor-table tr:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  /* === Narrow Mode Responsive === */
  :host([narrow]) .device-card {
    border-radius: 0;
    border-left: none;
    border-right: none;
  }

  :host([narrow]) .dialog {
    max-width: 100%;
    border-radius: 0;
  }

  :host([narrow]) .device-stats {
    grid-template-columns: 1fr;
  }

  :host([narrow]) .dialog-overlay {
    padding: 0;
  }

  :host([narrow]) .tab-bar button {
    font-size: 12px;
    padding: 10px 12px;
  }

  :host([narrow]) .conversation-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
    max-height: 40%;
  }

  :host([narrow]) .chat-layout {
    flex-direction: column;
  }

  /* === Sender Colors === */
  .sender-color-1 {
    --sender-color: #FF6B6B;
  }

  .sender-color-2 {
    --sender-color: #4ECDC4;
  }

  .sender-color-3 {
    --sender-color: #FFE66D;
  }

  .sender-color-4 {
    --sender-color: #95E1D3;
  }

  .sender-color-5 {
    --sender-color: #C7CEEA;
  }

  .sender-color-6 {
    --sender-color: #FF8B94;
  }

  .sender-color-7 {
    --sender-color: #B5EAD7;
  }

  .sender-color-8 {
    --sender-color: #FFB7B2;
  }

  /* === Accessibility === */
  .bubble:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .send-button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .dialog-button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .form-input:focus-visible,
  .form-select:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
`,fe=/^<[^>]+>\s*/,ye=/@\[([^\]]+)\]/g,be=/@(\w+)/g,_e={recipient_type_entity:"select.meshcore_recipient_type",channel_entity:"select.meshcore_channel",contact_entity:"select.meshcore_contact",channel_entity_pattern:"binary_sensor.meshcore_{prefix}_ch_{idx}_messages",contact_entity_pattern:"binary_sensor.meshcore_{prefix}_{contact}_messages",domain_filter:"meshcore"},xe={..._e,hours_to_show:48,initial_hours:1,max_messages:500,show_date_separators:!0,group_messages:!0,group_timeout:300,timestamp_format:"relative",update_mode:"auto",refresh_interval:30,enable_cache:!0,cache_ttl:86400,cache_max_size:5242880};async function we(e,t){try{const i={type:"meshcore_chat/get_contacts"};return t&&(i.entry_id=t),(await e.callWS(i)).contacts||[]}catch{return[]}}async function $e(e,t){try{const i={type:"meshcore_chat/get_channels"};return t&&(i.entry_id=t),(await e.callWS(i)).channels||[]}catch{return[]}}async function ke(e,t){try{const i={type:"meshcore_chat/get_device_config"};return t&&(i.entry_id=t),await e.callWS(i)}catch{throw new Error("Failed to get device configuration")}}async function Ce(e,t,i){try{const o={type:"meshcore_chat/set_device_config",settings:t};return i&&(o.entry_id=i),await e.callWS(o)}catch{return{success:!1,changed:[]}}}async function Se(e,t,i,o){try{const r={type:"meshcore_chat/execute_local",command:t};return i&&(r.args=i),o&&(r.entry_id=o),await e.callWS(r)}catch(e){return{response:String(e),success:!1,timestamp:(new Date).toISOString()}}}async function Me(e,t,i,o){try{const r={type:"meshcore_chat/execute_remote",target_prefix:t,command:i};return o&&(r.entry_id=o),await e.callWS(r)}catch(e){return{response:String(e),success:!1,timestamp:(new Date).toISOString()}}}async function ze(e,t,i,o){try{const r={type:"meshcore_chat/add_contact",public_key:t};return i&&(r.name=i),o&&(r.entry_id=o),await e.callWS(r)}catch{return{success:!1}}}async function Ae(e,t,i){try{const o={type:"meshcore_chat/remove_contact",public_key:t};return i&&(o.entry_id=i),await e.callWS(o)}catch{return{success:!1}}}const De=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];function Oe(e){const t=[],i=new Set;let o;const r=new RegExp(ye.source,"g");for(;null!==(o=r.exec(e));){const e=o[1];i.has(e)||(i.add(e),t.push(e))}const s=new RegExp(be.source,"g");for(;null!==(o=s.exec(e));){const e=o[1];i.has(e)||(i.add(e),t.push(e))}return t}function Ie(e){return{id:e.id,sender:e.sender,text:e.text,timestamp:new Date(e.timestamp),isOutgoing:e.outgoing,isSystem:!1,raw:e.text,mentions:Oe(e.text),rxLogData:e.rx_log_data,deliveryStatus:e.delivery_status?{status:e.delivery_status,ackReceived:e.ack_received,repeaterCount:e.repeater_count,roundTripMs:e.round_trip_ms}:void 0,repeaterCount:e.repeater_count}}function Ee(e,t){return e.getFullYear()!==t.getFullYear()||e.getMonth()!==t.getMonth()||e.getDate()!==t.getDate()}function Te(e){const t=new Date,i=new Date(t.getFullYear(),t.getMonth(),t.getDate()),o=new Date(e.getFullYear(),e.getMonth(),e.getDate()),r=Math.floor((i.getTime()-o.getTime())/864e5);return 0===r?"Today":1===r?"Yesterday":r<7?e.toLocaleDateString(void 0,{weekday:"long"}):e.toLocaleDateString(void 0,{weekday:"long",month:"long",day:"numeric"})}class Re{constructor(e){this._messages=[],this._loading=!1,this._error=null,this._entityId=null,this._hass=null,this._pollTimer=null,this._realtimeSubscriptions=[],this._retryCount=0,this._onChange=null,this._fetchDebounce=null,this._active=!1,this._hasOlderMessages=!0,this._loadingOlder=!1,this._config=e}get messages(){return this._messages}get loading(){return this._loading}get error(){return this._error}get entityId(){return this._entityId}get loadingOlder(){return this._loadingOlder}get hasOlderMessages(){return this._hasOlderMessages}setOnChange(e){this._onChange=e}setHass(e){this._hass=e}setConfig(e){this._config=e}async switchEntity(e){if(e!==this._entityId){if(this._stopUpdates(),this._entityId=e,this._messages=[],this._error=null,this._retryCount=0,this._hasOlderMessages=!0,this._loadingOlder=!1,!e)return this._active=!1,void this._notify();this._active=!0,this._startUpdates(e),await this._fetchMessages(e)}}async refresh(){this._entityId&&await this._fetchMessages(this._entityId)}addOptimisticMessage(e,t){const i=new Date,o={id:`optimistic_${i.getTime()}_${Math.random().toString(36).slice(2,8)}`,sender:e,text:t,timestamp:i,isOutgoing:!0,isSystem:!1,raw:`${e}: ${t}`,mentions:[]};this._messages=[...this._messages,o],this._notify()}async loadOlderMessages(){if(!this._loadingOlder&&this._hasOlderMessages&&this._hass&&this._entityId){this._loadingOlder=!0,this._notify();try{const e=this._messages.find(e=>!e.id.startsWith("rt_")&&!e.id.startsWith("optimistic_")),t={type:"meshcore_chat/get_stored_messages",entity_id:this._entityId,limit:50};e&&(t.before=e.id);const i=await this._hass.callWS(t),o=i.messages.map(Ie);this._hasOlderMessages=i.has_more;const r=new Set(this._messages.map(e=>e.id)),s=o.filter(e=>!r.has(e.id));s.length>0&&(this._messages=[...s,...this._messages],this._messages.sort((e,t)=>e.timestamp.getTime()-t.timestamp.getTime()))}catch{}finally{this._loadingOlder=!1,this._notify()}}}async fetchAroundTimestamp(e){const t=new Date(e).getTime(),i=this._messages.find(e=>Math.abs(e.timestamp.getTime()-t)<2e3);if(i)return!0;let o=0;for(;this._hasOlderMessages&&o<20;){await this.loadOlderMessages(),o++;const e=this._messages.find(e=>Math.abs(e.timestamp.getTime()-t)<2e3);if(e)return!0}return!1}pause(){this._stopUpdates(),this._active=!1,this._fetchDebounce&&(clearTimeout(this._fetchDebounce),this._fetchDebounce=null)}async resume(){this._entityId&&!this._active&&(this._active=!0,this._startUpdates(this._entityId),await this._fetchMessages(this._entityId))}destroy(){this._stopUpdates(),this._active=!1,this._fetchDebounce&&(clearTimeout(this._fetchDebounce),this._fetchDebounce=null),this._onChange=null}async _fetchMessages(e){if(this._hass){this._loading=!0,this._notify();try{const t=50,i=await this._hass.callWS({type:"meshcore_chat/get_stored_messages",entity_id:e,limit:t}),o=i.messages.map(Ie);this._hasOlderMessages=i.has_more;const r=new Set(o.map(e=>e.id)),s=this._messages.filter(e=>{if(e.id.startsWith("optimistic_")){const t=o.some(t=>t.sender===e.sender&&t.text===e.text);return!t}if(e.id.startsWith("rt_")){const t=e.id.substring(3);return!r.has(t)}return!1});this._messages=[...o,...s],this._messages.sort((e,t)=>e.timestamp.getTime()-t.timestamp.getTime());const a=this._config.max_messages??500;this._messages.length>a&&(this._messages=this._messages.slice(-a),this._hasOlderMessages=!0),this._error=null,this._retryCount=0}catch(e){const t=e instanceof Error?e.message:String(e);this._error=`Failed to fetch messages: ${t}`,this._retryCount++}finally{this._loading=!1,this._notify()}}}_startUpdates(e){this._startPolling(e),this._subscribeRealtime(e).catch(()=>{})}async _subscribeRealtime(e){if(!this._hass)return;const t=[];try{const i=await this._hass.connection.subscribeEvents(t=>{t.data.entity_id===e&&this._handleRealtimeMessage(t.data)},"meshcore_message");t.push(i);const o=await this._hass.connection.subscribeEvents(t=>{t.data.entity_id===e&&this._handleDeliveryUpdate(t.data)},"meshcore_delivery_update");t.push(o),this._realtimeSubscriptions=t}catch(e){throw t.forEach(e=>e()),e}}_handleRealtimeMessage(e){const t=e.sender_name??e.sender,i=e.message??e.text;if(t===this._config.node_name){if(t&&i){const o=e.ack_received,r=e.repeater_count,s=e.rx_log_data,a=e.message_type;let n;n="dm"===a||"direct"===a?{status:!0===o?"delivered":"sent",ackReceived:o??void 0}:{status:"sent",repeaterCount:r??s?.length??0};for(let e=this._messages.length-1;e>=0;e--){const o=this._messages[e];if(o.id.startsWith("optimistic_")&&o.sender===t&&o.text===i){o.deliveryStatus=n,s&&(o.rxLogData=s),this._notify();break}}}this._entityId&&this._debouncedFetch(this._entityId)}else{if(t&&i){let o=i.replace(fe,"");const r=t+": ";o.startsWith(r)&&(o=o.substring(r.length));const s=e.timestamp||(new Date).toISOString(),a=new Date(s),n=function(e,t,i){return function(e){const t=(new TextEncoder).encode(e),i=t.length,o=8*i,r=i+9+63&-64,s=new Uint8Array(r);s.set(t),s[i]=128;const a=new DataView(s.buffer);a.setUint32(r-4,o,!1);let n=1779033703,c=3144134277,d=1013904242,l=2773480762,p=1359893119,h=2600822924,g=528734635,m=1541459225;const u=new Int32Array(64);for(let e=0;e<r;e+=64){for(let t=0;t<16;t++)u[t]=a.getInt32(e+4*t,!1);for(let e=16;e<64;e++){const t=(u[e-15]>>>7|u[e-15]<<25)^(u[e-15]>>>18|u[e-15]<<14)^u[e-15]>>>3,i=(u[e-2]>>>17|u[e-2]<<15)^(u[e-2]>>>19|u[e-2]<<13)^u[e-2]>>>10;u[e]=u[e-16]+t+u[e-7]+i|0}let t=n,i=c,o=d,r=l,s=p,v=h,f=g,y=m;for(let e=0;e<64;e++){const a=y+((s>>>6|s<<26)^(s>>>11|s<<21)^(s>>>25|s<<7))+(s&v^~s&f)+De[e]+u[e]|0,n=t&i^t&o^i&o;y=f,f=v,v=s,s=r+a|0,r=o,o=i,i=t,t=a+(((t>>>2|t<<30)^(t>>>13|t<<19)^(t>>>22|t<<10))+n|0)|0}n=n+t|0,c=c+i|0,d=d+o|0,l=l+r|0,p=p+s|0,h=h+v|0,g=g+f|0,m=m+y|0}const v=e=>(e>>>0).toString(16).padStart(8,"0");return v(n)+v(c)+v(d)+v(l)+v(p)+v(h)+v(g)+v(m)}(`${e}|${t}|${i}`).substring(0,12)}(s,t,o),c=`rt_${n}`,d=this._messages.some(e=>e.id===c||e.id===n);if(!d){const r=Oe(o),s=e.rx_log_data,n={id:c,sender:t,text:o,timestamp:a,isOutgoing:!1,isSystem:!1,raw:i,mentions:r,rxLogData:s&&s.length>0?s:void 0};this._messages.push(n),this._messages.sort((e,t)=>e.timestamp.getTime()-t.timestamp.getTime()),this._notify()}}this._entityId&&this._debouncedFetch(this._entityId)}}_debouncedFetch(e){this._fetchDebounce&&clearTimeout(this._fetchDebounce),this._fetchDebounce=setTimeout(async()=>{if(this._fetchDebounce=null,this._active)try{await this._fetchMessages(e)}catch{}},500)}_handleDeliveryUpdate(e){const t=e.rx_log_data;if(e.progressive&&t&&t.length>0){const i=e.sender_name,o=e.message,r=e.timestamp;if(i&&o){const e=r?new Date(r).getTime():0;for(let r=this._messages.length-1;r>=0;r--){const s=this._messages[r];if(!s.isOutgoing&&s.sender===i&&s.text===o&&(!e||Math.abs(s.timestamp.getTime()-e)<1e4))return s.rxLogData=t,s.repeaterCount=t.length,void this._notify()}}}const i=e.send_id,o=e.status,r=e.repeater_count,s=e.ack_received,a=e.round_trip_ms,n=e.progressive;if(!i)return;let c,d;c=o||(!0===s?"delivered":!n||void 0!==r&&0!==r?"sent":"waiting");for(let e=this._messages.length-1;e>=0;e--)if(this._messages[e].isOutgoing){d=this._messages[e];break}d&&(d.deliveryStatus={status:c,repeaterCount:r,ackReceived:s,roundTripMs:a},void 0!==r&&(d.repeaterCount=r),this._notify())}async _pollFetch(e){if(this._hass)try{let t;for(let e=this._messages.length-1;e>=0;e--){const i=this._messages[e].id;if(!i.startsWith("rt_")&&!i.startsWith("optimistic_")){t=i;break}}const i={type:"meshcore_chat/get_stored_messages",entity_id:e,limit:50};t&&(i.after=t);const o=await this._hass.callWS(i);if(0===o.messages.length)return this._error=null,void(this._retryCount=0);const r=o.messages.map(Ie),s=new Set(this._messages.map(e=>e.id)),a=r.filter(e=>!s.has(e.id));if(a.length>0){const e=new Set(a.map(e=>e.id));this._messages=this._messages.filter(t=>!t.id.startsWith("rt_")||!e.has(t.id.substring(3))),this._messages=this._messages.filter(e=>!e.id.startsWith("optimistic_")||!a.some(t=>t.sender===e.sender&&t.text===e.text)),this._messages=[...this._messages,...a],this._messages.sort((e,t)=>e.timestamp.getTime()-t.timestamp.getTime());const t=this._config.max_messages??500;this._messages.length>t&&(this._messages=this._messages.slice(-t),this._hasOlderMessages=!0),this._notify()}this._error=null,this._retryCount=0}catch{this._retryCount++}}_startPolling(e){const t=()=>{if(!this._active)return;const i=this._retryCount>=5?6e4:3e4;this._pollTimer=setTimeout(async()=>{if(this._active){try{await this._pollFetch(e)}catch{}t()}},i)};t()}_stopUpdates(){this._pollTimer&&(clearTimeout(this._pollTimer),this._pollTimer=null);for(const e of this._realtimeSubscriptions)e();this._realtimeSubscriptions=[]}_notify(){this._onChange&&this._onChange()}}let Fe=class extends de{constructor(){super(...arguments),this.conversations=[],this.activeId=null,this.searchQuery="",this.unreadCounts={},this._activeFilter="all",this._filteredConversations=[]}updated(e){(e.has("conversations")||e.has("searchQuery")||e.has("_activeFilter"))&&this._updateFiltered()}render(){const e=this.searchQuery.length>0;return j`
      <div class="sidebar-header">
        <span class="sidebar-title">Chats</span>
        <button
          class="compose-btn"
          title="Manage contacts & channels"
          @click=${()=>this.dispatchEvent(new CustomEvent("manage-requested",{bubbles:!0,composed:!0}))}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </button>
      </div>
      <div class="sidebar-search">
        <input
          type="text"
          placeholder="Search conversations..."
          .value=${this.searchQuery}
          @input=${e=>{const t=e.target;this.searchQuery=t.value}} />
      </div>
      <div class="filter-bar ${e?"searching":""}">
        ${this._renderFilterBtn("all","All")}
        ${this._renderFilterBtn("unread","Unread")}
        ${this._renderFilterBtn("dms","DMs")}
        ${this._renderFilterBtn("channels","Channels")}
      </div>
      <div class="conversation-list">
        ${this._filteredConversations.length>0?this._filteredConversations.map(e=>this._renderConversation(e)):j`
              <div class="empty-state">
                <div class="empty-text">
                  ${this._emptyMessage(e)}
                </div>
              </div>
            `}
      </div>
    `}_renderFilterBtn(e,t){return j`
      <button
        class="filter-btn ${this._activeFilter===e?"active":""}"
        @click=${()=>{this._activeFilter=e}}>
        ${t}
      </button>
    `}_emptyMessage(e){if(e)return"No conversations found";switch(this._activeFilter){case"unread":return"No unread conversations";case"dms":return"No direct messages";case"channels":return"No channels";default:return"No conversations yet"}}_renderConversation(e){const t="pubkey_prefix"in e,i=t?e.pubkey_prefix:String(e.channel_idx),o=t?e.adv_name:e.name,r=t?e.pubkey_prefix:`Channel ${e.channel_idx}`,s=t?e.pubkey_prefix.substring(0,2).toUpperCase():`#${e.channel_idx}`,a=this.activeId===i;return j`
      <div
        class=${a?"conversation-item active":"conversation-item"}
        @click=${()=>this.dispatchEvent(new CustomEvent("conversation-selected",{detail:{id:i,isContact:t}}))}>
        <div class="conversation-avatar ${t?"":"channel"}">${s}</div>
        <div class="conversation-info">
          <div class="conversation-name">${o}</div>
          <div class="conversation-detail">${r}</div>
        </div>
        ${this._getUnreadCount(i)>0?j`<div class="unread-badge">${this._getUnreadCount(i)}</div>`:j`<span class="chevron">›</span>`}
      </div>
    `}_getUnreadCount(e){for(const[t,i]of Object.entries(this.unreadCounts))if(!(i<=0))if(/^\d+$/.test(e)){if(t.endsWith(`_ch_${e}_messages`))return i}else{const o=e.substring(0,6);if(t.endsWith(`_${o}_messages`))return i}return 0}_updateFiltered(){const e=this.searchQuery.toLowerCase();if(e)this._filteredConversations=this.conversations.filter(t=>("pubkey_prefix"in t?t.adv_name:t.name).toLowerCase().includes(e));else switch(this._activeFilter){case"all":this._filteredConversations=[...this.conversations];break;case"unread":this._filteredConversations=this.conversations.filter(e=>{const t="pubkey_prefix"in e?e.pubkey_prefix:String(e.channel_idx);return this._getUnreadCount(t)>0});break;case"dms":this._filteredConversations=this.conversations.filter(e=>"pubkey_prefix"in e);break;case"channels":this._filteredConversations=this.conversations.filter(e=>!("pubkey_prefix"in e))}}};Fe.styles=a`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 280px;
      border-right: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, #fff);
      flex-shrink: 0;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 12px 0;
      gap: 8px;
    }

    .sidebar-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--primary-text-color);
      flex: 1;
    }

    .compose-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }

    .compose-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: var(--primary-text-color);
    }

    .sidebar-search {
      padding: 12px 12px 8px;
    }

    .sidebar-search input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border: 1px solid var(--input-border);
      border-radius: 20px;
      background: var(--input-bg);
      color: var(--primary-text-color);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .sidebar-search input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .sidebar-search input::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    .filter-bar {
      display: flex;
      padding: 4px 12px 8px;
      gap: 4px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      transition: opacity 0.2s;
    }

    .filter-bar.searching {
      opacity: 0.5;
      pointer-events: none;
    }

    .filter-btn {
      flex: 1;
      padding: 6px 4px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 16px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .filter-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    .filter-btn.active {
      background: var(--primary-color, #03a9f4);
      border-color: var(--primary-color, #03a9f4);
      color: #fff;
    }

    .conversation-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .conversation-list::-webkit-scrollbar {
      width: 6px;
    }

    .conversation-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .conversation-list::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .conversation-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      cursor: pointer;
      transition: background 0.15s;
    }

    .conversation-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .conversation-item.active {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
      border-left: 3px solid var(--primary-color, #03a9f4);
    }

    .conversation-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }

    .conversation-avatar.channel {
      background: var(--accent-color, #ff9800);
    }

    .conversation-info {
      flex: 1;
      overflow: hidden;
    }

    .conversation-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .conversation-detail {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chevron {
      flex-shrink: 0;
      color: var(--secondary-text-color, #727272);
      font-size: 18px;
      line-height: 1;
      opacity: 0.5;
    }

    .unread-badge {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
      padding: 24px;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }
  `,e([me({type:Array})],Fe.prototype,"conversations",void 0),e([me({type:String})],Fe.prototype,"activeId",void 0),e([me({type:String})],Fe.prototype,"searchQuery",void 0),e([me({type:Object})],Fe.prototype,"unreadCounts",void 0),e([ue()],Fe.prototype,"_activeFilter",void 0),e([ue()],Fe.prototype,"_filteredConversations",void 0),Fe=e([pe("meshcore-conversation-list")],Fe);let Ne=class extends de{constructor(){super(...arguments),this.open=!1,this.narrow=!1,this.editMode=!1,this.initialChannelIdx=0,this.initialChannelName="",this.availableIndices=[],this._channelIdx=0,this._channelName="",this._customKey="",this._autoKey=!0,this._saving=!1,this._error=null,this._initialized=!1}willUpdate(e){e.has("open")&&this.open&&!this._initialized&&(this.editMode?(this._channelIdx=this.initialChannelIdx,this._channelName=this.initialChannelName):this._channelIdx=this.availableIndices.length>0?this.availableIndices[0]:0,this._initialized=!0),e.has("open")&&!this.open&&(this._initialized=!1)}render(){if(!this.open)return;const e=this._customKey.length,t=64===e||0===e||this._autoKey;return j`
      <div
        class="dialog-overlay"
        @click=${this._onOverlayClick}>
        <div class="dialog">
          <div class="dialog-header">
            <div class="dialog-header-title">${this.editMode?"Edit Channel":"Add Channel"}</div>
          </div>
          <div class="dialog-body">
            ${this._error?j`<div style="padding: 12px; background: rgba(219, 68, 55, 0.1); border-radius: 6px; color: var(--error-color, #db4437); font-size: 13px; margin-bottom: 16px;">
                  ${this._error}
                </div>`:""}

            <!-- Channel Index -->
            <div class="form-group">
              <label class="form-label required">Channel Index</label>
              ${this.editMode?j`
                    <select class="form-select" disabled>
                      <option value=${this._channelIdx} selected>${this._channelIdx}</option>
                    </select>`:j`
                    <select
                      class="form-select"
                      @change=${e=>{this._channelIdx=parseInt(e.target.value,10)}}>
                      ${this.availableIndices.map(e=>j`
                        <option value=${e} ?selected=${e===this._channelIdx}>${e}</option>
                      `)}
                    </select>`}
              <div class="form-description">${this.editMode?"Channel index cannot be changed":"Select an available channel slot"}</div>
            </div>

            <!-- Channel Name -->
            <div class="form-group">
              <label class="form-label required">Channel Name</label>
              <input
                type="text"
                class="form-input"
                placeholder="e.g., general, alerts"
                .value=${this._channelName}
                @input=${e=>{this._channelName=e.target.value}}
              />
              <div class="form-description">Friendly name for the channel</div>
            </div>

            <!-- Auto Key Toggle -->
            <div class="form-group">
              <label class="form-toggle">
                <input
                  type="checkbox"
                  ?checked=${this._autoKey}
                  @change=${e=>{this._autoKey=e.target.checked}}
                />
                <span class="form-toggle-label">Auto-generate key from name</span>
              </label>
              <div class="form-description">
                Auto-key generates SHA256 hash of the channel name
              </div>
            </div>

            <!-- Custom Key (if not auto) -->
            ${this._autoKey?"":j`
                  <div class="form-group">
                    <label class="form-label required">Custom Key</label>
                    <input
                      type="text"
                      class="form-input hex-input"
                      placeholder="64 hex characters (a-f, 0-9)"
                      .value=${this._customKey}
                      @input=${e=>{const t=e.target.value.toLowerCase().replace(/[^a-f0-9]/g,"");this._customKey=t.slice(0,64)}}
                    />
                    <div class="hex-counter">${this._customKey.length} / 64 hex characters</div>
                    <div class="form-description">
                      ${t?"Valid hex key":`Invalid: expected 64 characters, got ${e}`}
                    </div>
                  </div>
                `}
          </div>
          <div class="dialog-footer">
            <button
              class="dialog-button"
              ?disabled=${this._saving}
              @click=${this._onCancel}>
              Cancel
            </button>
            <button
              class="dialog-button primary"
              ?disabled=${!this._channelName||this._saving||!this._autoKey&&!t||!this.editMode&&0===this.availableIndices.length}
              @click=${this._onSave}>
              ${this._saving?"Saving...":"Save"}
            </button>
          </div>
        </div>
      </div>
    `}async _onSave(){if(this.hass&&this._channelName){this._saving=!0,this._error=null;try{(await async function(e,t,i,o,r){try{const s={type:"meshcore_chat/set_channel",channel_idx:t,name:i};return o&&(s.key=o),r&&(s.entry_id=r),await e.callWS(s)}catch{return{success:!1}}}(this.hass,this._channelIdx,this._channelName,this._autoKey?void 0:this._customKey,this.entryId)).success?(this.dispatchEvent(new CustomEvent("channel-saved",{detail:{channelIdx:this._channelIdx,name:this._channelName},bubbles:!0})),this._reset()):this._error="Failed to save channel"}catch(e){this._error=`Error: ${String(e)}`}finally{this._saving=!1}}}_onCancel(){this._reset(),this.dispatchEvent(new CustomEvent("close",{bubbles:!0}))}_onOverlayClick(e){e.target===e.currentTarget&&this._onCancel()}_reset(){this._channelIdx=0,this._channelName="",this._customKey="",this._autoKey=!0,this._error=null}};Ne.styles=[ve,a`
      :host {
        display: block;
      }

      :host([narrow]) .dialog {
        max-width: 100%;
      }

      .dialog {
        max-width: 500px;
      }

      .hex-input {
        font-family: monospace;
        letter-spacing: 1px;
      }

      .hex-counter {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 4px;
      }
    `],e([me({type:Boolean})],Ne.prototype,"open",void 0),e([me({type:Object})],Ne.prototype,"hass",void 0),e([me({type:String})],Ne.prototype,"entryId",void 0),e([me({type:Boolean})],Ne.prototype,"narrow",void 0),e([me({type:Boolean})],Ne.prototype,"editMode",void 0),e([me({type:Number})],Ne.prototype,"initialChannelIdx",void 0),e([me({type:String})],Ne.prototype,"initialChannelName",void 0),e([me({type:Array})],Ne.prototype,"availableIndices",void 0),e([ue()],Ne.prototype,"_channelIdx",void 0),e([ue()],Ne.prototype,"_channelName",void 0),e([ue()],Ne.prototype,"_customKey",void 0),e([ue()],Ne.prototype,"_autoKey",void 0),e([ue()],Ne.prototype,"_saving",void 0),e([ue()],Ne.prototype,"_error",void 0),Ne=e([pe("meshcore-channel-dialog")],Ne);let Le=class extends de{constructor(){super(...arguments),this.narrow=!1,this._activeTab="contacts",this._contacts=[],this._channels=[],this._searchQuery="",this._loading=!1,this._actionInProgress=null,this._confirmingRemoveContact=null,this._confirmingRemoveChannel=null,this._channelDialogOpen=!1,this._editingChannel=null,this._maxChannels=4}connectedCallback(){super.connectedCallback(),this._loadData()}render(){return j`
      <div class="dialog" @click=${e=>e.stopPropagation()}>
        <div class="dialog-header">
          <span class="dialog-title">Manage</span>
          <button class="close-btn" @click=${this._close}>✕</button>
        </div>

        <div class="tab-bar">
          <button
            class=${"contacts"===this._activeTab?"active":""}
            @click=${()=>this._switchTab("contacts")}>
            Contacts
          </button>
          <button
            class=${"channels"===this._activeTab?"active":""}
            @click=${()=>this._switchTab("channels")}>
            Channels
          </button>
        </div>

        ${"contacts"===this._activeTab?j`
              <div class="search-bar">
                <input
                  type="text"
                  placeholder="Search contacts..."
                  .value=${this._searchQuery}
                  @input=${e=>{this._searchQuery=e.target.value}}
                  @keydown=${e=>{"Escape"===e.key&&this._close()}}
                />
              </div>
            `:""}

        <div class="list-area">
          ${this._loading?j`<div class="loading-state">
                <div class="loading-spinner"></div>
                Loading...
              </div>`:"contacts"===this._activeTab?this._renderContacts():this._renderChannels()}
        </div>
      </div>

      ${this._channelDialogOpen?j`
            <meshcore-channel-dialog
              .open=${!0}
              .hass=${this.hass}
              .entryId=${this.entryId}
              .narrow=${this.narrow}
              .editMode=${!!this._editingChannel}
              .initialChannelIdx=${this._editingChannel?.channel_idx??0}
              .initialChannelName=${this._editingChannel?.name??""}
              .availableIndices=${this._getAvailableIndices()}
              @channel-saved=${this._onChannelSaved}
              @close=${()=>{this._channelDialogOpen=!1,this._editingChannel=null}}
            ></meshcore-channel-dialog>
          `:""}
    `}_renderContacts(){const e=this._filterContacts();if(0===e.length)return j`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg></div>
          <div class="empty-text">
            ${this._searchQuery?"No contacts found":"No contacts discovered"}
          </div>
        </div>
      `;const t=[...e].sort((e,t)=>e.added_to_node!==t.added_to_node?e.added_to_node?-1:1:e.adv_name.localeCompare(t.adv_name));return t.map(e=>this._renderContactItem(e))}_renderContactItem(e){const t=e.pubkey_prefix.substring(0,2).toUpperCase(),i=e.added_to_node,o=this._confirmingRemoveContact===e.public_key,r=this._actionInProgress===e.public_key;return j`
      <div class="contact-item">
        <div class="contact-avatar">${t}</div>
        <div class="contact-info">
          <div class="contact-name">${e.adv_name||"Unknown"}</div>
          <div class="contact-meta">
            <span class="contact-prefix">${e.pubkey_prefix}</span>
            <span class="badge ${i?"added":"discovered"}">
              ${i?j`<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" style="vertical-align: -1px; margin-right: 2px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Added`:"Discovered"}
            </span>
          </div>
        </div>
        ${o?j`
              <div class="confirm-inline">
                <span class="confirm-text">Remove?</span>
                <button class="confirm-btn yes" @click=${()=>this._doRemoveContact(e)}>Yes</button>
                <button class="confirm-btn no" @click=${()=>{this._confirmingRemoveContact=null}}>No</button>
              </div>
            `:i?j`
                <button
                  class="action-btn remove"
                  ?disabled=${r}
                  @click=${()=>{this._confirmingRemoveContact=e.public_key}}>
                  ${r?"...":"Remove"}
                </button>
              `:j`
                <button
                  class="action-btn add"
                  ?disabled=${r}
                  @click=${()=>this._doAddContact(e)}>
                  ${r?"...":j`<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="vertical-align: -1px; margin-right: 4px;"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Add`}
                </button>
              `}
      </div>
    `}_renderChannels(){if(0===this._channels.length)return j`
        <div class="empty-state">
          <div class="empty-icon">#</div>
          <div class="empty-text">No channels configured</div>
        </div>
        <button class="add-channel-btn" @click=${this._openAddChannel}>
          + Add Channel
        </button>
      `;const e=this._confirmingRemoveChannel;return j`
      ${this._channels.map(t=>{const i=e===t.channel_idx,o=this._actionInProgress===`ch-${t.channel_idx}`;return j`
          <div class="channel-item">
            <div class="channel-icon">#</div>
            <div class="channel-info">
              <div class="channel-name">${t.name}</div>
              <div class="channel-idx">Index ${t.channel_idx}</div>
            </div>
            ${i?j`
                  <div class="confirm-inline">
                    <span class="confirm-text">Remove?</span>
                    <button class="confirm-btn yes" @click=${()=>this._doRemoveChannel(t)}>Yes</button>
                    <button class="confirm-btn no" @click=${()=>{this._confirmingRemoveChannel=null}}>No</button>
                  </div>
                `:j`
                  <div class="channel-actions">
                    <button
                      class="action-btn"
                      ?disabled=${o}
                      @click=${()=>this._openEditChannel(t)}>
                      Edit
                    </button>
                    <button
                      class="action-btn remove"
                      ?disabled=${o}
                      @click=${()=>{this._confirmingRemoveChannel=t.channel_idx}}>
                      ${o?"...":"Remove"}
                    </button>
                  </div>
                `}
          </div>
        `})}
      <button class="add-channel-btn" @click=${this._openAddChannel}>
        + Add Channel
      </button>
    `}async _loadData(){if(this.hass){this._loading=!0;try{const[e,t]=await Promise.all([we(this.hass,this.entryId),$e(this.hass,this.entryId)]);this._contacts=e,this._channels=t;try{const e=await ke(this.hass,this.entryId);e?.max_channels&&(this._maxChannels=e.max_channels)}catch{}}finally{this._loading=!1}}}_switchTab(e){this._activeTab=e,this._searchQuery="",this._confirmingRemoveContact=null,this._confirmingRemoveChannel=null}_filterContacts(){if(!this._searchQuery)return this._contacts;const e=this._searchQuery.toLowerCase();return this._contacts.filter(t=>(t.adv_name||"").toLowerCase().includes(e)||(t.pubkey_prefix||"").toLowerCase().includes(e))}async _doAddContact(e){if(this.hass){this._actionInProgress=e.public_key;try{if((await ze(this.hass,e.public_key,e.adv_name,this.entryId)).success){const e=await we(this.hass,this.entryId);this._contacts=e,this.dispatchEvent(new CustomEvent("contacts-changed",{bubbles:!0,composed:!0}))}}finally{this._actionInProgress=null}}}async _doRemoveContact(e){if(this.hass){this._confirmingRemoveContact=null,this._actionInProgress=e.public_key;try{if((await Ae(this.hass,e.public_key,this.entryId)).success){const e=await we(this.hass,this.entryId);this._contacts=e,this.dispatchEvent(new CustomEvent("contacts-changed",{bubbles:!0,composed:!0}))}}finally{this._actionInProgress=null}}}_openAddChannel(){this._editingChannel=null,this._channelDialogOpen=!0}_openEditChannel(e){this._editingChannel=e,this._channelDialogOpen=!0}_getAvailableIndices(){const e=new Set(this._channels.map(e=>e.channel_idx)),t=[];for(let i=0;i<this._maxChannels;i++)e.has(i)||t.push(i);return t}async _doRemoveChannel(e){if(this.hass){this._confirmingRemoveChannel=null,this._actionInProgress=`ch-${e.channel_idx}`;try{if((await async function(e,t,i){try{const o={type:"meshcore_chat/remove_channel",channel_idx:t};return i&&(o.entry_id=i),await e.callWS(o)}catch{return{success:!1}}}(this.hass,e.channel_idx,this.entryId)).success){const e=await $e(this.hass,this.entryId);this._channels=e,this.dispatchEvent(new CustomEvent("channels-changed",{bubbles:!0,composed:!0}))}}finally{this._actionInProgress=null}}}async _onChannelSaved(){if(this._channelDialogOpen=!1,this._editingChannel=null,this.hass){const e=await $e(this.hass,this.entryId);this._channels=e,this.dispatchEvent(new CustomEvent("channels-changed",{bubbles:!0,composed:!0}))}}_close(){this.dispatchEvent(new CustomEvent("manage-closed",{bubbles:!0,composed:!0}))}};Le.styles=a`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      padding: 16px;
    }

    .dialog {
      display: flex;
      flex-direction: column;
      max-width: 500px;
      width: 100%;
      max-height: 80vh;
      border-radius: 12px;
      background: var(--card-background-color, #fff);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.2s ease-out;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    :host([narrow]) .dialog {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
      height: 100%;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .dialog-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.15s;
    }

    .close-btn:hover {
      color: var(--primary-text-color);
      background: rgba(0, 0, 0, 0.05);
    }

    /* Tab bar */
    .tab-bar {
      display: flex;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .tab-bar button {
      flex: 1;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-bottom: 3px solid transparent;
    }

    .tab-bar button:hover {
      color: var(--primary-text-color);
      background: rgba(0, 0, 0, 0.02);
    }

    .tab-bar button.active {
      color: var(--primary-color, #03a9f4);
      border-bottom-color: var(--primary-color, #03a9f4);
    }

    /* Search */
    .search-bar {
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .search-bar input {
      width: 100%;
      box-sizing: border-box;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: var(--primary-background-color, #fafafa);
      color: var(--primary-text-color);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-bar input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .search-bar input::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    /* List area */
    .list-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .list-area::-webkit-scrollbar {
      width: 6px;
    }

    .list-area::-webkit-scrollbar-track {
      background: transparent;
    }

    .list-area::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb-color, #c1c1c1);
      border-radius: 3px;
    }

    /* Contact items */
    .contact-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      transition: background 0.15s;
    }

    .contact-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .contact-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      flex-shrink: 0;
    }

    .contact-info {
      flex: 1;
      overflow: hidden;
    }

    .contact-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
    }

    .contact-prefix {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-family: monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .badge {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    .badge.added {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
      color: var(--primary-color, #03a9f4);
    }

    .badge.discovered {
      background: rgba(0, 0, 0, 0.06);
      color: var(--secondary-text-color, #727272);
    }

    /* Action buttons */
    .action-btn {
      padding: 6px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .action-btn:hover {
      border-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
    }

    .action-btn.add {
      border-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
    }

    .action-btn.add:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
    }

    .action-btn.remove {
      border-color: var(--error-color, #db4437);
      color: var(--error-color, #db4437);
    }

    .action-btn.remove:hover {
      background: var(--error-color, #db4437);
      color: #fff;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Confirm inline */
    .confirm-inline {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .confirm-inline .confirm-text {
      font-size: 12px;
      color: var(--error-color, #db4437);
      font-weight: 500;
    }

    .confirm-inline .confirm-btn {
      padding: 4px 10px;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .confirm-inline .confirm-btn.yes {
      background: var(--error-color, #db4437);
      color: #fff;
    }

    .confirm-inline .confirm-btn.no {
      background: var(--divider-color, #e0e0e0);
      color: var(--primary-text-color);
    }

    /* Channel items */
    .channel-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      transition: background 0.15s;
    }

    .channel-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .channel-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.1);
      color: var(--primary-color, #03a9f4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 16px;
      flex-shrink: 0;
    }

    .channel-info {
      flex: 1;
      overflow: hidden;
    }

    .channel-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .channel-idx {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-family: monospace;
    }

    .channel-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    /* Add channel button at bottom */
    .add-channel-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin: 12px 16px;
      padding: 10px 16px;
      border: 2px dashed var(--divider-color, #e0e0e0);
      border-radius: 8px;
      background: transparent;
      color: var(--primary-color, #03a9f4);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .add-channel-btn:hover {
      border-color: var(--primary-color, #03a9f4);
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.05);
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--secondary-text-color, #727272);
      text-align: center;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }

    /* Loading */
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: var(--secondary-text-color);
      font-size: 13px;
      gap: 8px;
    }

    .loading-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--divider-color, #e0e0e0);
      border-top-color: var(--primary-color, #03a9f4);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `,e([me({type:Object})],Le.prototype,"hass",void 0),e([me({type:String})],Le.prototype,"entryId",void 0),e([me({type:Boolean})],Le.prototype,"narrow",void 0),e([ue()],Le.prototype,"_activeTab",void 0),e([ue()],Le.prototype,"_contacts",void 0),e([ue()],Le.prototype,"_channels",void 0),e([ue()],Le.prototype,"_searchQuery",void 0),e([ue()],Le.prototype,"_loading",void 0),e([ue()],Le.prototype,"_actionInProgress",void 0),e([ue()],Le.prototype,"_confirmingRemoveContact",void 0),e([ue()],Le.prototype,"_confirmingRemoveChannel",void 0),e([ue()],Le.prototype,"_channelDialogOpen",void 0),e([ue()],Le.prototype,"_editingChannel",void 0),e([ue()],Le.prototype,"_maxChannels",void 0),Le=e([pe("meshcore-manage-dialog")],Le);const qe=e=>(...t)=>({_$litDirective$:e,values:t});class Pe{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,i){this._$Ct=e,this._$AM=t,this._$Ci=i}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}}class He extends Pe{constructor(e){if(super(e),this.it=W,2!==e.type)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===W||null==e)return this._t=void 0,this.it=e;if(e===U)return e;if("string"!=typeof e)throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}He.directiveName="unsafeHTML",He.resultType=1;const Be=qe(He);let Ve=class extends de{constructor(){super(...arguments),this.timestampFormat="relative",this._selectedMessage=null}render(){return this.group?j`
        ${this._renderGroup()}
        ${this._selectedMessage?this._renderMessageDialog(this._selectedMessage):j``}
      `:j``}_renderGroup(){if(!this.group)return j``;const e=this.group,t={"message-group":!0,incoming:!e.isOutgoing&&!e.isSystem,outgoing:e.isOutgoing,system:e.isSystem};let i;return e.messages.length>0&&(i=e.messages[0].senderColor||function(e){let t=0;for(let i=0;i<e.length;i++)t=(t<<5)-t+e.charCodeAt(i);const i=["#e57373","#64b5f6","#81c784","#ffb74d","#ba68c8","#4dd0e1","#fff176","#a1887f"];return i[Math.abs(t)%i.length]}(e.sender)),j`
      <div class=${this._classMap(t)} style=${i?`--sender-color: ${i}`:""}>
        ${e.isSystem||e.isOutgoing?j``:j`<div class="sender">${e.sender}</div>`}
        ${e.messages.map(e=>this._renderBubble(e))}
      </div>
    `}_renderBubble(e){const t={bubble:!0,incoming:!e.isOutgoing&&!e.isSystem,outgoing:e.isOutgoing,system:e.isSystem},i=e.isOutgoing&&e.deliveryStatus?this._getStatusLabel(e.deliveryStatus):"",o=function(e,t){switch(t){case"relative":default:return function(e){const t=Date.now()-e.getTime(),i=Math.floor(t/1e3),o=Math.floor(i/60),r=Math.floor(o/60);return i<60?"now":o<60?`${o}m`:r<24?`${r}h`:e.toLocaleDateString(void 0,{month:"short",day:"numeric"})}(e);case"time":return e.toLocaleTimeString(void 0,{hour:"numeric",minute:"2-digit"});case"datetime":return e.toLocaleString(void 0,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}}(e.timestamp,this.timestampFormat);return j`
      <div class=${this._classMap(t)} data-msg-id=${e.id} @click=${t=>{t.stopPropagation(),this._selectedMessage=e}}>
        <div class="message-text">${this._renderTextWithMentions(e.text,e.mentions)}</div>
        <div class="timestamp">${i?j`<span class="delivery-status">${i}</span> · `:""}${o}</div>
      </div>
    `}_getStatusLabel(e){const t=e.status,i=e.repeaterCount??0;switch(t){case"pending":case"waiting":return"Waiting...";case"sent":return i>0?"Repeated":"Unheard";case"delivered":return"Delivered";case"failed":return"Failed";default:return"Sent"}}_renderTextWithMentions(e,t){let i=e;const o=new Set(t);for(const e of o){const t=new RegExp(`@\\[${e}\\]`,"g");i=i.replace(t,`<span class="mention">@${e}</span>`)}for(const e of o){const t=new RegExp(`@${e}\\b`,"g");i=i.replace(t,`<span class="mention">@${e}</span>`)}return Be(i)}_renderMessageDialog(e){const t=e.rxLogData&&e.rxLogData.length>0,i=t?e.rxLogData.map(e=>{const t=e.path_nodes,i=e.hop_count,o=e.snr,r=e.rssi,s=[];return t&&t.length>0?s.push(t.map(e=>e.substring(0,4).toUpperCase()).join(" > ")):void 0!==i?s.push(`${i} hop${1!==i?"s":""}`):s.push("0 hops"),void 0!==o&&s.push(`SNR: ${o}`),void 0!==r&&s.push(`RSSI: ${r}`),s.join(" · ")}).join(" | "):"",o=e.timestamp.toLocaleString(void 0,{weekday:"short",month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit"}),r="padding: 8px 16px; font-size: 12px; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color, #e0e0e0);";return j`
      <div class="message-dialog-overlay" @click=${()=>{this._selectedMessage=null}}>
        <div class="message-dialog" @click=${e=>e.stopPropagation()}>
          <div class="message-dialog-preview">${e.text}</div>
          <button class="message-dialog-action" @click=${()=>this._copyText(e.text)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>Copy Text
          </button>
          ${e.isOutgoing||e.isSystem?j``:j`
                <button class="message-dialog-action" @click=${()=>this._replyToSender(e.sender)}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>Reply
                </button>
              `}
          ${t?j`
                <div class="message-dialog-route" @click=${()=>this._copyText(i)}>
                  Route: ${i}
                </div>
              `:j``}
          <div style=${r}>
            ${e.isOutgoing?"Sent":"Received"}: ${o}
          </div>
          ${e.isOutgoing&&e.deliveryStatus?j`
                <div style=${r}>
                  ${(e.deliveryStatus.repeaterCount??0)>0?`${e.deliveryStatus.repeaterCount} repeater${1===e.deliveryStatus.repeaterCount?"":"s"} responded`:"No repeaters responded"}${e.deliveryStatus.ackReceived?" · ACK received":""}${e.deliveryStatus.roundTripMs?` · ${e.deliveryStatus.roundTripMs}ms RTT`:""}
                </div>
              `:j``}
        </div>
      </div>
    `}async _copyText(e){try{await navigator.clipboard.writeText(e)}catch{const t=document.createElement("textarea");t.value=e,t.style.position="fixed",t.style.opacity="0",document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t)}this._selectedMessage=null}_replyToSender(e){this.dispatchEvent(new CustomEvent("reply-to-sender",{detail:{mention:`@[${e}] `},bubbles:!0,composed:!0})),this._selectedMessage=null}_classMap(e){return Object.entries(e).filter(([,e])=>e).map(([e])=>e).join(" ")}};Ve.styles=a`
    :host {
      display: block;
    }

    .message-group {
      margin-bottom: 8px;
      display: flex;
      flex-direction: column;
    }

    .message-group.outgoing {
      align-items: flex-end;
    }

    .message-group.incoming {
      align-items: flex-start;
    }

    .message-group.system {
      align-items: center;
    }

    .sender {
      font-size: 12px;
      font-weight: 600;
      color: var(--sender-color, var(--primary-color, #03a9f4));
      margin-bottom: 2px;
      padding: 0 4px;
      max-width: 85%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .message-group.outgoing .sender {
      display: none;
    }

    .bubble {
      max-width: 85%;
      padding: 8px 12px;
      border-radius: 16px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      position: relative;
      cursor: pointer;
      transition: opacity 0.15s;
      line-height: 1.4;
      font-size: 14px;
    }

    .bubble:active {
      opacity: 0.7;
    }

    .bubble.search-highlight {
      animation: highlight-flash 2.5s ease-out;
    }

    @keyframes highlight-flash {
      0%, 20% {
        box-shadow: 0 0 0 3px rgba(var(--rgb-primary-color, 3, 169, 244), 0.6);
      }
      100% {
        box-shadow: 0 0 0 3px transparent;
      }
    }

    .bubble + .bubble {
      margin-top: 2px;
    }

    .bubble.incoming {
      background: var(--bubble-incoming-bg, var(--secondary-background-color, #e8e8e8));
      color: var(--bubble-incoming-text, var(--primary-text-color, #212121));
      border-bottom-left-radius: 4px;
    }

    .bubble.incoming:first-of-type {
      border-top-left-radius: 16px;
    }

    .bubble.outgoing {
      background: var(--bubble-outgoing-bg, var(--primary-color, #03a9f4));
      color: var(--bubble-outgoing-text, #fff);
      border-bottom-right-radius: 4px;
    }

    .bubble.outgoing:first-of-type {
      border-top-right-radius: 16px;
    }

    .bubble.system {
      background: transparent;
      color: var(--system-msg-color, var(--secondary-text-color, #727272));
      font-style: italic;
      font-size: 13px;
      text-align: center;
      cursor: default;
      padding: 4px 12px;
    }

    .message-text {
      white-space: pre-wrap;
    }

    .message-text .mention {
      background: var(--mention-bg, rgba(3, 169, 244, 0.15));
      color: var(--mention-text, var(--primary-color, #03a9f4));
      font-weight: 600;
      padding: 1px 4px;
      border-radius: 4px;
    }

    .bubble.outgoing .message-text .mention {
      background: rgba(255, 255, 255, 0.25);
      color: #fff;
    }

    .timestamp {
      font-size: 11px;
      color: var(--timestamp-color, var(--secondary-text-color, #727272));
      margin-top: 2px;
      padding: 0 4px;
    }

    .bubble.outgoing .timestamp {
      color: rgba(255, 255, 255, 0.6);
    }

    .bubble.incoming .timestamp {
      color: var(--secondary-text-color, #727272);
    }

    .message-group.outgoing .timestamp {
      text-align: right;
    }

    .route-info {
      font-size: 10px;
      color: var(--timestamp-color, var(--secondary-text-color, #727272));
      padding: 2px 4px;
      font-family: monospace;
    }

    .route-info-inline {
      font-size: 11px;
      color: var(--timestamp-color, var(--secondary-text-color, #727272));
      font-family: monospace;
      margin-top: 2px;
      padding: 0 4px;
      opacity: 0.7;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .delivery-status {
      color: inherit;
    }

    .message-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .message-dialog {
      background: #333;
      border: 2px solid var(--primary-color, #03a9f4);
      border-radius: 12px;
      box-shadow: 0 0 20px rgba(var(--rgb-primary-color, 3, 169, 244), 0.3);
      min-width: 240px;
      max-width: 300px;
      overflow: hidden;
      z-index: 21;
    }

    .message-dialog-preview {
      padding: 12px 16px;
      font-size: 13px;
      color: var(--secondary-text-color);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 280px;
    }

    .message-dialog-action {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px 16px;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      min-height: 48px;
      transition: background 0.15s;
    }

    .message-dialog-action:hover,
    .message-dialog-action:active {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
    }

    .message-dialog-action + .message-dialog-action {
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }

    .message-dialog-route {
      padding: 12px 16px;
      font-size: 12px;
      color: var(--secondary-text-color);
      border-top: 1px solid var(--divider-color, #e0e0e0);
      cursor: pointer;
      font-family: monospace;
      word-break: break-all;
      transition: background 0.15s;
    }

    .message-dialog-route:hover,
    .message-dialog-route:active {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.15);
    }
  `,e([me({type:Object})],Ve.prototype,"group",void 0),e([me({type:Object})],Ve.prototype,"message",void 0),e([me({type:String})],Ve.prototype,"timestampFormat",void 0),e([ue()],Ve.prototype,"_selectedMessage",void 0),Ve=e([pe("meshcore-message-bubble")],Ve);let je=class extends de{constructor(){super(...arguments),this._query="",this._fromDate="",this._toDate="",this._results=[],this._totalCount=0,this._searching=!1,this._hasSearched=!1,this._showFilters=!1,this._debounceTimer=null}render(){return j`
      <div class="search-header">
        <div class="search-row">
          <input
            class="search-input"
            type="text"
            placeholder="Search messages..."
            .value=${this._query}
            @input=${this._onQueryInput}
          />
          <button
            class="filter-toggle ${this._showFilters?"active":""}"
            @click=${()=>{this._showFilters=!this._showFilters}}>
            Filters
          </button>
        </div>
        ${this._showFilters?j`
              <div class="filters">
                <input
                  class="filter-input"
                  type="date"
                  placeholder="From"
                  .value=${this._fromDate}
                  @change=${e=>{this._fromDate=e.target.value,this._doSearch()}}
                />
                <input
                  class="filter-input"
                  type="date"
                  placeholder="To"
                  .value=${this._toDate}
                  @change=${e=>{this._toDate=e.target.value,this._doSearch()}}
                />
              </div>
            `:""}
        ${this._hasSearched?j`<div class="result-count">${this._totalCount} result${1!==this._totalCount?"s":""}</div>`:""}
      </div>

      <div class="results">
        ${this._searching?j`<div class="loading-state">Searching...</div>`:this._hasSearched?0===this._results.length?j`
                  <div class="empty-state">
                    <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M20 6H10v6H8V4h6V0H6v6H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 14H4V8h4v2c0 1.1.9 2 2 2h6v2h-2v2h2v2h-2v2h6V10h-4v10h2z"/></svg></div>
                    <div class="empty-text">No messages found</div>
                  </div>
                `:this._results.map(e=>this._renderResult(e)):j`
                <div class="empty-state">
                  <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></div>
                  <div class="empty-text">Search your message history</div>
                </div>
              `}
      </div>
    `}_renderResult(e){const t=new Date(e.timestamp),i=t.toLocaleDateString(void 0,{month:"short",day:"numeric"}),o=t.toLocaleTimeString(void 0,{hour:"2-digit",minute:"2-digit"}),r=this._highlightQuery(e.text);return j`
      <div class="result-item" @click=${()=>this._onResultClick(e)}>
        <div class="result-meta">
          <span class="result-sender">${e.sender}</span>
          <span class="result-conversation">${e.conversation_name}</span>
          <span>${i} ${o}</span>
        </div>
        <div class="result-text">${r}</div>
      </div>
    `}_highlightQuery(e){if(!this._query.trim())return e;const t=this._query.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),i=new RegExp(`(${t})`,"gi"),o=e.split(i),r=this._query.toLowerCase();return o.map(e=>e.toLowerCase()===r?j`<mark>${e}</mark>`:e)}_onQueryInput(e){this._query=e.target.value,null!==this._debounceTimer&&clearTimeout(this._debounceTimer),this._query.trim().length>=2?this._debounceTimer=window.setTimeout(()=>this._doSearch(),400):(this._results=[],this._hasSearched=!1)}async _doSearch(){if(this.hass&&this._query.trim()&&this.entityId){this._searching=!0,this._hasSearched=!0;try{const e={type:"meshcore_chat/search_stored_messages",query:this._query.trim(),entity_id:this.entityId,limit:100};if(this._fromDate&&(e.from_date=new Date(this._fromDate).toISOString()),this._toDate){const t=new Date(this._toDate);t.setHours(23,59,59,999),e.to_date=t.toISOString()}const t=await this.hass.callWS(e);this._results=t.results||[],this._totalCount=this._results.length}catch{this._results=[],this._totalCount=0}finally{this._searching=!1}}}_onResultClick(e){this.dispatchEvent(new CustomEvent("result-selected",{detail:{entityId:e.entity_id,messageId:e.id,conversationName:e.conversation_name,timestamp:e.timestamp},bubbles:!0,composed:!0}))}};je.styles=a`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .search-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    .search-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .search-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .search-input::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    .filter-toggle {
      padding: 6px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--secondary-text-color);
      font-size: 12px;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.15s;
    }

    .filter-toggle:hover,
    .filter-toggle.active {
      border-color: var(--primary-color, #03a9f4);
      color: var(--primary-color, #03a9f4);
    }

    .filters {
      display: flex;
      gap: 8px;
    }

    .filter-input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      font-size: 12px;
      outline: none;
    }

    .filter-input:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .result-count {
      font-size: 12px;
      color: var(--secondary-text-color);
      padding: 0 4px;
    }

    .results {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .results::-webkit-scrollbar {
      width: 6px;
    }

    .results::-webkit-scrollbar-track {
      background: transparent;
    }

    .results::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .result-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      cursor: pointer;
      transition: background 0.15s;
    }

    .result-item:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .result-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--secondary-text-color);
    }

    .result-sender {
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .result-conversation {
      font-style: italic;
    }

    .result-text {
      font-size: 13px;
      color: var(--primary-text-color);
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .result-text mark {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
      color: inherit;
      border-radius: 2px;
      padding: 0 2px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color);
      text-align: center;
      padding: 24px;
    }

    .empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 13px;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--secondary-text-color);
      font-size: 13px;
      gap: 8px;
    }
  `,e([me({type:Object})],je.prototype,"hass",void 0),e([me({type:String})],je.prototype,"entryId",void 0),e([me({type:String})],je.prototype,"entityId",void 0),e([me({type:String})],je.prototype,"meshNodeName",void 0),e([ue()],je.prototype,"_query",void 0),e([ue()],je.prototype,"_fromDate",void 0),e([ue()],je.prototype,"_toDate",void 0),e([ue()],je.prototype,"_results",void 0),e([ue()],je.prototype,"_totalCount",void 0),e([ue()],je.prototype,"_searching",void 0),e([ue()],je.prototype,"_hasSearched",void 0),e([ue()],je.prototype,"_showFilters",void 0),je=e([pe("meshcore-message-search")],je);let Ke=class extends de{constructor(){super(...arguments),this.conversations=[],this.selectedId=null,this.narrow=!1,this.unreadCounts={},this._messageStore=null,this._inputText="",this._sending=!1,this._viewportNarrow=!1,this._mediaQuery=null,this._mediaHandler=null,this._narrowShowMessages=!1,this._manageOpen=!1,this._searchOpen=!1,this._currentEntityId=null,this._conversationResolved=!1,this._pendingScroll=null,this._scrollInFlight=!1,this._scrollGuardUntil=0,this._lastMessageCount=0,this._unreadCountAtSelection=0}get _isNarrow(){return this.narrow||this._viewportNarrow}connectedCallback(){super.connectedCallback(),this.config&&!this._messageStore&&(this._messageStore=new Re(this.config),this._messageStore.setOnChange(()=>this.requestUpdate())),this._mediaQuery=window.matchMedia("(max-width: 870px)"),this._viewportNarrow=this._mediaQuery.matches,this._mediaHandler=e=>{this._viewportNarrow=e.matches},this._mediaQuery.addEventListener("change",this._mediaHandler)}disconnectedCallback(){super.disconnectedCallback(),this._messageStore&&(this._messageStore.destroy(),this._messageStore=null),this._mediaQuery&&this._mediaHandler&&(this._mediaQuery.removeEventListener("change",this._mediaHandler),this._mediaQuery=null,this._mediaHandler=null)}updated(e){if(e.has("hass")&&this.hass&&this._messageStore&&this._messageStore.setHass(this.hass),e.has("config")&&this.config&&this._messageStore&&this._messageStore.setConfig(this.config),e.has("selectedId")&&this._onConversationSelected(),e.has("conversations")&&!this.selectedId&&!this._isNarrow&&this.conversations.length>0){const e=this.conversations[0],t="pubkey_prefix"in e;this.selectedId=t?e.pubkey_prefix:String(e.channel_idx)}if(this._pendingScroll){const e=this._messageStore,t=e&&!e.loading;t&&e.messages.length>0?(this._executeScroll(this._pendingScroll),this._pendingScroll=null,this._lastMessageCount=e.messages.length):t&&0===e.messages.length&&(this._pendingScroll=null)}else if(this._messageStore){const e=this._messageStore.messages.length;e>this._lastMessageCount&&this._lastMessageCount>0&&(this._scrollToBottomIfNearEnd(),this._markActiveRead(this._currentEntityId)),this._lastMessageCount=e}}render(){return this._isNarrow?this._narrowShowMessages?j`
          <div class="chat-layout">
            <div class="chat-main narrow-full">
              <div class="narrow-header">
                <button class="back-button" @click=${()=>this._narrowShowMessages=!1}>← Back</button>
                <span class="narrow-conv-name">${this._getConversationName()}</span>
                <div class="chat-header-actions">
                  <button class="header-action-btn" title="Search messages" @click=${()=>{this._searchOpen=!this._searchOpen}}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>
                </div>
              </div>
              ${this._renderChatArea()}
            </div>
          </div>
        `:j`
          <div class="chat-layout narrow-list-only">
            <meshcore-conversation-list
              .conversations=${this.conversations}
              .activeId=${this.selectedId}
              .unreadCounts=${this.unreadCounts}
              @conversation-selected=${e=>{const t=e.detail.id;t===this.selectedId&&(this._unreadCountAtSelection=0,this._pendingScroll="bottom"),this.selectedId=t,this._narrowShowMessages=!0}}
              @manage-requested=${()=>this._onManageRequested()}></meshcore-conversation-list>
            ${this._manageOpen?j`
              <meshcore-manage-dialog
                .hass=${this.hass}
                .entryId=${this.config?.node_prefix}
                .narrow=${this.narrow}
                @manage-closed=${()=>this._manageOpen=!1}
                @contacts-changed=${this._onContactsChanged}
                @channels-changed=${this._onChannelsChanged}
              ></meshcore-manage-dialog>
            `:j``}
          </div>
        `:j`
      <div class="chat-layout">
        <meshcore-conversation-list
          .conversations=${this.conversations}
          .activeId=${this.selectedId}
          .unreadCounts=${this.unreadCounts}
          @conversation-selected=${e=>{const t=e.detail.id;t===this.selectedId&&(this._unreadCountAtSelection=0,this._pendingScroll="bottom"),this.selectedId=t}}
          @manage-requested=${()=>this._onManageRequested()}></meshcore-conversation-list>
        <div class="chat-main">
          ${this.selectedId?j`
            <div class="narrow-header" style="display: flex; align-items: center; padding: 8px 16px;">
              <div style="flex: 1; font-size: 14px; font-weight: 500; color: var(--primary-text-color);">
                ${this._getConversationName()}
              </div>
              <div class="chat-header-actions">
                <button class="header-action-btn" title="Search messages" @click=${()=>{this._searchOpen=!this._searchOpen}}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></button>
              </div>
            </div>
          `:""}
          ${this._renderChatArea()}
        </div>
        ${this._searchOpen?j`
          <div class="search-panel">
            <meshcore-message-search
              .hass=${this.hass}
              .entryId=${this.config?.node_prefix}
              .entityId=${this._currentEntityId||void 0}
              .meshNodeName=${this.config?.node_name}
              @result-selected=${this._onSearchResultSelected}
            ></meshcore-message-search>
          </div>
        `:""}
        ${this._manageOpen?j`
          <meshcore-manage-dialog
            .hass=${this.hass}
            .entryId=${this.config?.node_prefix}
            .narrow=${this.narrow}
            @manage-closed=${()=>this._manageOpen=!1}
            @contacts-changed=${this._onContactsChanged}
            @channels-changed=${this._onChannelsChanged}
          ></meshcore-manage-dialog>
        `:j``}
      </div>
    `}_renderChatArea(){if(!this._messageStore||!this.selectedId)return j`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg></div>
          <div class="empty-text">Select a conversation to start</div>
          <div class="empty-subtext">Choose a channel or contact from the list</div>
        </div>
      `;if(!this._conversationResolved)return j`
        <div class="empty-state">
          <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg></div>
          <div class="empty-text">Conversation unavailable</div>
          <div class="empty-subtext">This contact may no longer be added to the node</div>
        </div>
      `;const e=this._messageStore.messages,t=function(e,t){const i=!1!==t.group_messages?function(e,t){if(0===e.length)return[];const i=[];let o=null;for(const r of e)!o||r.isSystem||o.isSystem||r.sender!==o.sender||(r.timestamp.getTime()-o.endTime.getTime())/1e3>t?(o={sender:r.sender,isOutgoing:r.isOutgoing,isSystem:r.isSystem,messages:[r],startTime:r.timestamp,endTime:r.timestamp},i.push(o)):(o.messages.push(r),o.endTime=r.timestamp);return i}(e,t.group_timeout??300):e.map(e=>({sender:e.sender,isOutgoing:e.isOutgoing,isSystem:e.isSystem,messages:[e],startTime:e.timestamp,endTime:e.timestamp}));if(0===i.length)return[];const o=[];let r=null;for(const e of i){const i=e.startTime;!1===t.show_date_separators||r&&!Ee(r,i)||o.push({type:"date-separator",date:i,label:Te(i)}),o.push({type:"group",group:e}),r=i}return o}(e,{group_messages:this.config?.group_messages??!0,group_timeout:this.config?.group_timeout??300,show_date_separators:this.config?.show_date_separators??!0});return j`
      <div class="chat-container" @reply-to-sender=${this._onReplyToSender} @scroll=${this._onChatScroll}>
        ${this._messageStore.loadingOlder?j`<div class="loading-older"><div class="loading-spinner"></div></div>`:j``}
        ${this._messageStore.error?j`
              <div class="error-state">
                <span><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg></span>
                <span>${this._messageStore.error}</span>
              </div>
            `:j``}
        ${this._messageStore.loading&&0===e.length?j`
              <div class="loading-state">
                <div class="loading-spinner"></div>
                Loading messages...
              </div>
            `:j``}
        ${0!==t.length||this._messageStore.loading?j``:j`
              <div class="empty-state">
                <div class="empty-icon"><svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/></svg></div>
                <div class="empty-text">No messages yet</div>
                <div class="empty-subtext">Be the first to send a message!</div>
              </div>
            `}
        ${this._renderItemsWithDivider(t)}
      </div>
      <div class="input-area">
        <textarea
          placeholder="Type a message..."
          .value=${this._inputText}
          @input=${e=>{const t=e.target;this._inputText=t.value}}
          @keydown=${e=>{"Enter"!==e.key||e.shiftKey||(e.preventDefault(),this._sendMessage())}}
          ?disabled=${this._sending||!this.selectedId}></textarea>
        <button
          class="send-button"
          @click=${()=>this._sendMessage()}
          ?disabled=${this._sending||!this.selectedId||!this._inputText.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16151496 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4429026 C0.994623095,2.0752101 0.837654326,3.00778453 1.15159189,3.98029867 L3.03521743,10.4212916 C3.03521743,10.5783889 3.19218622,10.7354863 3.50612381,10.7354863 L16.6915026,11.5209733 C16.6915026,11.5209733 17.1624089,11.5209733 17.1624089,12.0492776 C17.1624089,12.5775818 16.6915026,12.4744748 16.6915026,12.4744748 Z"/>
          </svg>
        </button>
      </div>
    `}_renderItemsWithDivider(e){const t=[];let i=0,o=!1,r=null;if(this._unreadCountAtSelection>0){const t=e.filter(e=>"date-separator"!==e.type).length-this._unreadCountAtSelection;r=t>=0?t:0}for(const s of e)"date-separator"!==s.type?(o||null===r||i!==r||(t.push(j`
          <div class="unread-divider">
            <span>New messages</span>
          </div>
        `),o=!0),t.push(j`
        <meshcore-message-bubble
          .group=${s.group}
          .timestampFormat=${this.config?.timestamp_format??"relative"}></meshcore-message-bubble>
      `),i++):t.push(j`
          <div class="date-separator">
            <span>${s.label}</span>
          </div>
        `);return t}_onConversationSelected(){if(this.selectedId&&this._messageStore&&this.config&&this.hass){const e=this.conversations.find(e=>"pubkey_prefix"in e?e.pubkey_prefix===this.selectedId:String(e.channel_idx)===this.selectedId);if(!e)return this._conversationResolved=!1,this._currentEntityId=null,void(this._messageStore&&this._messageStore.switchEntity(null));this._conversationResolved=!0;let t=null;if("pubkey_prefix"in e){const i=e.pubkey_prefix;t=function(e,t,i){const o=i.substring(0,6);if(t.contact_entity_pattern&&t.node_prefix){const i=t.contact_entity_pattern.replace("{prefix}",t.node_prefix).replace("{contact}",o);if(e.states[i])return i}const r=`_${o}_messages`,s=t.node_prefix?`_${t.node_prefix}_`:"";for(const t of Object.keys(e.states))if(t.startsWith("binary_sensor.")&&t.endsWith(r)&&(!s||t.includes(s)))return t;return null}(this.hass,this.config,i)}else{const i=e.channel_idx;t=function(e,t,i){if(t.channel_entity_pattern&&t.node_prefix){const o=t.channel_entity_pattern.replace("{prefix}",t.node_prefix).replace("{idx}",String(i));if(e.states[o])return o}const o=`_ch_${i}_messages`,r=t.node_prefix?`_${t.node_prefix}_`:"";for(const t of Object.keys(e.states))if(t.startsWith("binary_sensor.")&&t.endsWith(o)&&(!r||t.includes(r)))return t;return null}(this.hass,this.config,i)}this._currentEntityId=t,this.dispatchEvent(new CustomEvent("active-entity-changed",{detail:{entityId:t},bubbles:!0,composed:!0}));const i=this._getUnreadCountForSelected();this._pendingScroll=i>0?"last-read":"bottom",this._unreadCountAtSelection=i,this._lastMessageCount=0,this._messageStore.switchEntity(t),this._markActiveRead(t)}}async _sendMessage(){if(this._sending||!this._inputText.trim()||!this.selectedId||!this.hass||!this.config)return;if(!this._conversationResolved)return void console.warn("Cannot send — conversation not resolved");this._sending=!0;const e=this._inputText.trim();this._inputText="";try{if(this._messageStore&&(this._messageStore.addOptimisticMessage(this.config.node_name,e),this._pendingScroll="bottom"),this._isContact())await async function(e,t,i){try{await e.callService("meshcore","send_message",{pubkey_prefix:t,message:i})}catch(e){throw new Error(`Failed to send direct message: ${String(e)}`)}}(this.hass,this.selectedId,e);else{const t=parseInt(this.selectedId,10);if(isNaN(t)||t<0||t>255)return console.error("Invalid channel index:",this.selectedId),void(this._inputText=e);await async function(e,t,i){try{await e.callService("meshcore","send_channel_message",{channel_idx:t,message:i})}catch(e){throw new Error(`Failed to send channel message: ${String(e)}`)}}(this.hass,t,e)}}catch(t){console.error("Failed to send message:",t),this._inputText=e}finally{this._sending=!1}}_markActiveRead(e){e&&this.hass&&(async function(e,t,i){try{const o={type:"meshcore_chat/mark_conversation_read",entity_id:t};return i&&(o.entry_id=i),await e.callWS(o)}catch{return{success:!1}}}(this.hass,e,this.config?.node_prefix).catch(()=>{}),this.dispatchEvent(new CustomEvent("unread-cleared",{detail:{entityId:e},bubbles:!0,composed:!0})))}_isContact(){return!!this.selectedId&&!/^\d+$/.test(this.selectedId)}_onManageRequested(){this._manageOpen=!0}_onContactsChanged(){this.dispatchEvent(new CustomEvent("contacts-changed",{bubbles:!0,composed:!0}))}_onChannelsChanged(){this.dispatchEvent(new CustomEvent("channels-changed",{bubbles:!0,composed:!0}))}_onReplyToSender(e){const{mention:t}=e.detail;t&&(this._inputText=t+this._inputText,this.requestUpdate())}_getConversationName(){if(!this.selectedId)return"";const e=this.conversations.find(e=>"pubkey_prefix"in e?e.pubkey_prefix===this.selectedId:String(e.channel_idx)===this.selectedId);return e?"pubkey_prefix"in e?e.adv_name:e.name:this.selectedId}_getChatContainer(){return this.renderRoot?.querySelector(".chat-container")}_isScrollGuarded(){return this._scrollInFlight||Date.now()<this._scrollGuardUntil}_executeScroll(e){this._scrollInFlight=!0,"last-read"===e&&(this._scrollGuardUntil=Date.now()+2e3),this._doScrollWithRetry(e,0)}_doScrollWithRetry(e,t){this.updateComplete.then(()=>{requestAnimationFrame(()=>{requestAnimationFrame(()=>{const i=this._getChatContainer();if(!i)return void(this._scrollInFlight=!1);if("bottom"===e)return i.scrollTop=i.scrollHeight,void(this._scrollInFlight=!1);const o=i.querySelector(".unread-divider");if(o){const e=i.getBoundingClientRect(),t=o.getBoundingClientRect();i.scrollTop+=t.top-e.top,this._scrollInFlight=!1}else t<10?setTimeout(()=>this._doScrollWithRetry(e,t+1),50):(i.scrollTop=i.scrollHeight,this._scrollInFlight=!1)})})})}_scrollToBottomIfNearEnd(){this._isScrollGuarded()||this.updateComplete.then(()=>{requestAnimationFrame(()=>{if(this._isScrollGuarded())return;const e=this._getChatContainer();e&&e.scrollHeight-e.scrollTop-e.clientHeight<100&&(e.scrollTop=e.scrollHeight)})})}_onChatScroll(e){const t=e.target;if(t&&this._messageStore&&t.scrollTop<150&&this._messageStore.hasOlderMessages&&!this._messageStore.loadingOlder){const e=t.scrollHeight;this._messageStore.loadOlderMessages().then(()=>{this.updateComplete.then(()=>{requestAnimationFrame(()=>{const i=t.scrollHeight-e;i>0&&(t.scrollTop+=i)})})})}}_getUnreadCountForSelected(){if(!this.selectedId||!this.unreadCounts)return 0;if(this._currentEntityId&&this.unreadCounts[this._currentEntityId])return this.unreadCounts[this._currentEntityId];for(const[e,t]of Object.entries(this.unreadCounts))if(!(t<=0))if(/^\d+$/.test(this.selectedId)){if(e.endsWith(`_ch_${this.selectedId}_messages`))return t}else{const i=this.selectedId.substring(0,6);if(e.endsWith(`_${i}_messages`))return t}return 0}_onSearchResultSelected(e){const{entityId:t,messageId:i,timestamp:o}=e.detail;t&&this._messageStore&&(this._messageStore.switchEntity(t),this._currentEntityId=t),i&&this._scrollToAndHighlight(i,o)}_scrollToAndHighlight(e,t){this.updateComplete.then(()=>{requestAnimationFrame(()=>{this._findAndHighlightBubble(e)||t&&this._messageStore&&this._messageStore.fetchAroundTimestamp(t).then(t=>{t&&this.updateComplete.then(()=>{requestAnimationFrame(()=>{this._findAndHighlightBubble(e)})})})})})}_findAndHighlightBubble(e){const t=this.shadowRoot?.querySelector(".chat-container");if(!t)return!1;const i=t.querySelectorAll("meshcore-message-bubble");for(const t of Array.from(i)){const i=t.shadowRoot?.querySelector(`[data-msg-id="${e}"]`);if(i)return i.scrollIntoView({behavior:"smooth",block:"center"}),i.classList.add("search-highlight"),setTimeout(()=>i.classList.remove("search-highlight"),2500),!0}return!1}};Ke.styles=a`
    :host {
      display: flex;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .chat-layout {
      display: flex;
      width: 100%;
      height: 100%;
      gap: 0;
    }

    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--chat-bg);
    }

    .chat-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 12px;
      background: var(--chat-bg);
      position: relative;
    }

    .chat-container::-webkit-scrollbar {
      width: 6px;
    }

    .chat-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .chat-container::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .input-area {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      padding: 8px 12px 12px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
      background: var(--input-bg);
      flex-shrink: 0;
    }

    .input-area textarea {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--input-border);
      border-radius: 20px;
      background: var(--chat-bg);
      color: var(--primary-text-color);
      font-size: 14px;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 120px;
      min-height: 40px;
      line-height: 1.4;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .input-area textarea:focus {
      border-color: var(--primary-color, #03a9f4);
    }

    .input-area textarea::placeholder {
      color: var(--secondary-text-color, #727272);
    }

    .input-area textarea:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .send-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      cursor: pointer;
      flex-shrink: 0;
      transition: opacity 0.15s, transform 0.15s;
    }

    .send-button:hover {
      opacity: 0.9;
    }

    .send-button:active {
      transform: scale(0.95);
    }

    .send-button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .send-button svg {
      width: 20px;
      height: 20px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
      padding: 32px 16px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .empty-text {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .empty-subtext {
      font-size: 13px;
      opacity: 0.7;
    }

    .error-state {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      color: var(--error-color, #db4437);
      font-size: 13px;
      background: rgba(219, 68, 55, 0.08);
      border-radius: 8px;
      margin: 8px 12px;
    }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      color: var(--secondary-text-color, #727272);
      font-size: 14px;
      gap: 8px;
    }

    .loading-older {
      display: flex;
      justify-content: center;
      padding: 12px;
    }

    .loading-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid var(--divider-color, #e0e0e0);
      border-top-color: var(--primary-color, #03a9f4);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .date-separator {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 16px 0 12px;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      font-weight: 500;
    }

    .date-separator::before,
    .date-separator::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--divider-color, #e0e0e0);
    }

    .unread-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 12px 0;
      color: var(--error-color, #db4437);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.3px;
    }

    .unread-divider::before,
    .unread-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--error-color, #db4437);
      opacity: 0.5;
    }

    .narrow-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, #fff);
      flex-shrink: 0;
    }

    .back-button {
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: var(--primary-color, #03a9f4);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .back-button:hover {
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
    }

    .narrow-conv-name {
      flex: 1;
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .narrow-full {
      width: 100% !important;
    }

    .narrow-list-only {
      width: 100% !important;
    }

    .narrow-list-only meshcore-conversation-list {
      width: 100% !important;
      flex-shrink: 1;
    }

    .chat-header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
    }

    .header-action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: all 0.15s;
      font-size: 16px;
    }

    .header-action-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      color: var(--primary-text-color);
    }

    .search-panel {
      width: 300px;
      border-left: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, #fff);
      flex-shrink: 0;
      overflow: hidden;
    }
  `,e([me({type:Object})],Ke.prototype,"hass",void 0),e([me({type:Object})],Ke.prototype,"config",void 0),e([me({type:Array})],Ke.prototype,"conversations",void 0),e([me({type:String})],Ke.prototype,"selectedId",void 0),e([me({type:Boolean})],Ke.prototype,"narrow",void 0),e([me({type:Object})],Ke.prototype,"unreadCounts",void 0),e([ue()],Ke.prototype,"_messageStore",void 0),e([ue()],Ke.prototype,"_inputText",void 0),e([ue()],Ke.prototype,"_sending",void 0),e([ue()],Ke.prototype,"_viewportNarrow",void 0),e([ue()],Ke.prototype,"_narrowShowMessages",void 0),e([ue()],Ke.prototype,"_manageOpen",void 0),e([ue()],Ke.prototype,"_searchOpen",void 0),e([ue()],Ke.prototype,"_currentEntityId",void 0),e([ue()],Ke.prototype,"_conversationResolved",void 0),e([ue()],Ke.prototype,"_pendingScroll",void 0),Ke=e([pe("meshcore-chat-page")],Ke);const Ue=qe(class extends Pe{constructor(e){if(super(e),this._timer=null,this._startX=0,this._startY=0,this._attached=!1,this._callback=null,this._element=null,this._onPointerDown=e=>this._handleDown(e),this._onPointerUp=()=>this._cancelTimer(),this._onPointerMove=e=>this._handleMove(e),this._onContextMenu=e=>{null!==this._timer&&e.preventDefault()},6!==e.type)throw new Error("longPress directive must be used on an element")}render(e){}update(e,[t]){if(this._callback=t,!this._attached){this._element=e.element;const t=this._element;t.addEventListener("pointerdown",this._onPointerDown),t.addEventListener("pointerup",this._onPointerUp),t.addEventListener("pointercancel",this._onPointerUp),t.addEventListener("pointermove",this._onPointerMove),t.addEventListener("contextmenu",this._onContextMenu),this._attached=!0}return this.render(t)}_handleDown(e){0===e.button&&(this._startX=e.clientX,this._startY=e.clientY,this._cancelTimer(),this._timer=setTimeout(()=>{this._timer=null,this._callback?.()},500))}_handleMove(e){if(null===this._timer)return;const t=e.clientX-this._startX,i=e.clientY-this._startY;t*t+i*i>100&&this._cancelTimer()}_cancelTimer(){null!==this._timer&&(clearTimeout(this._timer),this._timer=null)}});let We=class extends de{constructor(){super(...arguments),this.entityId="",this.label="",this.icon="",this.colorScheme="neutral"}render(){if(!this.hass||!this.entityId)return W;const e=this.hass.states[this.entityId];if(!e)return W;const t=e.state,i=e.attributes?.unit_of_measurement||"",o=this.label||e.attributes?.friendly_name||this.entityId,r="unavailable"===t||"unknown"===t,s=this.hass.entities?.[this.entityId]?.display_precision;let a="";if("battery"===this.colorScheme){const e=parseFloat(t);isNaN(e)||(a=e>50?"battery-high":e>20?"battery-medium":"battery-low")}else"signal"===this.colorScheme&&(a="signal");return j`
      <div class="tile ${r?"unavailable":""}"
           @click=${this._openMoreInfo}
           @contextmenu=${this._onRightClick}
           ${Ue(()=>this._onRightClick(new MouseEvent("contextmenu")))}>
        <div class="tile-value-row">
          ${this.icon?j`<span class="tile-icon ${a}">${this._renderIcon()}</span>`:W}
          <span>${r?"—":this._formatValue(t,s)}${i?j`<span class="tile-unit">${i}</span>`:W}</span>
        </div>
        <div class="tile-label">${o}</div>
      </div>
    `}_openMoreInfo(){if(!this.entityId)return;const e=new CustomEvent("hass-more-info",{detail:{entityId:this.entityId},bubbles:!0,composed:!0});this.dispatchEvent(e)}_onRightClick(e){e.preventDefault(),this.entityId&&this.dispatchEvent(new CustomEvent("tile-context-menu",{detail:{entityId:this.entityId,label:this.label},bubbles:!0,composed:!0}))}_formatValue(e,t){const i=parseFloat(e);return isNaN(i)?e:null!=t&&t>=0?i.toFixed(t):e.includes(".")?e:i.toString()}_renderIcon(){switch(this.icon){case"battery":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>`;case"signal":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;case"clock":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>`;case"power":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.01 7L16 3h-2v4h-4V3H8v4h-.01C7 6.99 6 7.99 6 8.99v5.49L9.5 18v3h5v-3l3.5-3.51v-5.5c0-1-1-2-1.99-1.99z"/></svg>`;case"thermometer":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-2V5z"/></svg>`;case"counter":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;case"chart":return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>`;default:return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>`}}};We.styles=a`
    :host {
      display: block;
    }

    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 8px;
      border-radius: 8px;
      background: var(--primary-background-color, #fafafa);
      border: 1px solid var(--divider-color, #e0e0e0);
      min-width: 0;
      gap: 4px;
      transition: border-color 0.2s;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
    }

    .tile:hover {
      border-color: var(--primary-color, #03a9f4);
    }

    .tile:active {
      background: var(--secondary-background-color, #f0f0f0);
    }

    .tile-value-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text-color);
      line-height: 1.2;
    }

    .tile-icon {
      display: flex;
      align-items: center;
      color: var(--secondary-text-color);
    }

    .tile-icon.battery-high { color: #4caf50; }
    .tile-icon.battery-medium { color: #ff9800; }
    .tile-icon.battery-low { color: #f44336; }
    .tile-icon.signal { color: #2196f3; }

    .tile-label {
      font-size: 11px;
      color: var(--secondary-text-color);
      text-align: center;
      line-height: 1.2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .tile-unit {
      font-size: 12px;
      font-weight: 400;
      color: var(--secondary-text-color);
    }

    .unavailable {
      opacity: 0.5;
    }
  `,e([me({type:Object})],We.prototype,"hass",void 0),e([me({type:String})],We.prototype,"entityId",void 0),e([me({type:String})],We.prototype,"label",void 0),e([me({type:String})],We.prototype,"icon",void 0),e([me({type:String})],We.prototype,"colorScheme",void 0),We=e([pe("meshcore-sensor-tile")],We);let Ge=class extends de{constructor(){super(...arguments),this.data=[],this.neighbors=[],this.width=600,this.height=200,this.timeRange=24,this.COLORS=["#FF6B6B","#4ECDC4","#FFE66D","#95E1D3","#C7CEEA","#FF8B94","#B5EAD7","#FFB7B2"]}render(){if(!this.data||0===this.data.length||0===this.neighbors.length)return j`
        <div class="chart-container">
          <div class="empty-state">No data available</div>
        </div>
      `;const e=this._renderChart();return j`
      <div class="chart-container">
        ${e}
        <div class="legend">
          ${this.neighbors.map((e,t)=>{const i=this.COLORS[t%this.COLORS.length];return j`
              <div class="legend-item">
                <div class="legend-dot" style="background-color: ${i}"></div>
                <span>${e}</span>
              </div>
            `})}
        </div>
      </div>
    `}_renderChart(){const e=50,t=this.width-100,i=this.height-100;let o=1/0,r=-1/0;this.data.forEach(e=>{Object.values(e.values).forEach(e=>{"number"==typeof e&&(o=Math.min(o,e),r=Math.max(r,e))})}),isFinite(o)&&isFinite(r)||(o=-10,r=20);const s=r-o,a=o-.1*s,n=r+.1*s,c=t=>this.height-e-(t-a)/(n-a)*i,d=60*this.timeRange*60*1e3,l=Date.now(),p=l-d,h=i=>e+(i-p)/d*t,g=[];for(let t=0;t<=5;t++){const i=a+t/5*(n-a),o=c(i);g.push(K`
          <line x1="${e}" y1="${o}" x2="${this.width-e}" y2="${o}"
            stroke="var(--divider-color, #e0e0e0)" stroke-dasharray="4,4" opacity="0.3" />
          <text x="${42}" y="${o+4}" font-size="10" text-anchor="end"
            fill="var(--secondary-text-color, #727272)">${Math.round(i)}dB</text>
        `)}const m=[];for(let t=0;t<=5;t++){const i=p+t/5*d,o=h(i),r=this._formatTimeLabel(i,l);m.push(K`
          <text x="${o}" y="${this.height-e+16}" font-size="10" text-anchor="middle"
            fill="var(--secondary-text-color, #727272)">${r}</text>
        `)}const u=this.neighbors.map((e,t)=>{const i=this.COLORS[t%this.COLORS.length],o=[];return this.data.forEach(t=>{const i=t.values[e];if("number"==typeof i&&isFinite(i)){const e=h(t.timestamp),r=c(i);o.push(`${e},${r}`)}}),0===o.length?K``:K`
        <polyline points="${o.join(" ")}" fill="none" stroke="${i}"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      `});return K`
      <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${this.width}" height="${this.height}" fill="var(--input-bg)" />

        <!-- Grid lines -->
        ${g}

        <!-- Y-axis -->
        <line x1="${e}" y1="${e}" x2="${e}"
          y2="${this.height-e}" stroke="var(--divider-color, #e0e0e0)" stroke-width="1" />

        <!-- X-axis -->
        <line x1="${e}" y1="${this.height-e}"
          x2="${this.width-e}" y2="${this.height-e}"
          stroke="var(--divider-color, #e0e0e0)" stroke-width="1" />

        <!-- Data lines -->
        ${u}

        <!-- Time labels -->
        ${m}
      </svg>
    `}_formatTimeLabel(e,t){const i=(t-e)/36e5;return i>=24?`${Math.round(i)}h ago`:0===i?"Now":`${Math.round(i)}h`}};Ge.styles=a`
    :host {
      display: block;
      width: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .chart-container {
      width: 100%;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      background: var(--input-bg);
      padding: 12px;
      box-sizing: border-box;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--secondary-text-color, #727272);
      font-size: 14px;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--primary-text-color);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `,e([me({type:Array})],Ge.prototype,"data",void 0),e([me({type:Array})],Ge.prototype,"neighbors",void 0),e([me({type:Number})],Ge.prototype,"width",void 0),e([me({type:Number})],Ge.prototype,"height",void 0),e([me({type:Number})],Ge.prototype,"timeRange",void 0),Ge=e([pe("meshcore-snr-chart")],Ge);let Xe=class extends de{constructor(){super(...arguments),this.open=!1,this.title="Confirm",this.message="",this.confirmLabel="Confirm",this.cancelLabel="Cancel",this.dangerous=!1,this._typedValue=""}render(){if(!this.open)return;const e=this.requireTyped&&this._typedValue!==this.requireTyped;return j`
      <div class="dialog-overlay" @click=${this._onOverlayClick}>
        <div class="dialog">
          <div class="dialog-header">
            <div class="dialog-header-title">${this.title}</div>
          </div>
          <div class="dialog-body">
            <div style="margin-bottom: 16px;">${this.message}</div>
            ${this.requireTyped?j`
                  <div class="form-group">
                    <label class="form-label">Type to confirm</label>
                    <input
                      type="text"
                      class="form-input"
                      placeholder="Type '${this.requireTyped}'"
                      .value=${this._typedValue}
                      @input=${e=>{this._typedValue=e.target.value}}
                    />
                    <div class="form-description">
                      Type '${this.requireTyped}' to enable confirmation
                    </div>
                  </div>
                `:""}
          </div>
          <div class="dialog-footer">
            <button
              class="dialog-button"
              @click=${this._onCancel}>
              ${this.cancelLabel}
            </button>
            <button
              class="dialog-button primary ${this.dangerous?"danger-button":""}"
              ?disabled=${e}
              @click=${this._onConfirm}>
              ${this.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `}_onOverlayClick(e){e.target===e.currentTarget&&this._onCancel()}_onCancel(){this._typedValue="",this.dispatchEvent(new CustomEvent("cancel",{bubbles:!0}))}_onConfirm(){this.dispatchEvent(new CustomEvent("confirm",{bubbles:!0})),this._typedValue=""}};Xe.styles=[ve,a`
      :host {
        display: block;
      }
    `],e([me({type:Boolean})],Xe.prototype,"open",void 0),e([me({type:String})],Xe.prototype,"title",void 0),e([me({type:String})],Xe.prototype,"message",void 0),e([me({type:String})],Xe.prototype,"confirmLabel",void 0),e([me({type:String})],Xe.prototype,"cancelLabel",void 0),e([me({type:Boolean})],Xe.prototype,"dangerous",void 0),e([me({type:String})],Xe.prototype,"requireTyped",void 0),e([ue()],Xe.prototype,"_typedValue",void 0),Xe=e([pe("meshcore-confirm-dialog")],Xe);const Qe=[{name:"reboot",description:"Restart the device",category:"Device Management",dangerous:!0},{name:"poweroff",description:"Power off the device (v1.14.1+)",category:"Device Management",dangerous:!0},{name:"send_appstart",description:"Initialize connection, returns SELF_INFO with device details",category:"Device Management",responseFormat:"Device info with name, public key, radio params, location"},{name:"send_device_query",description:"Query device info (firmware, capabilities, path hash mode)",category:"Device Management",responseFormat:"Device information including firmware version and capabilities"},{name:"get_bat",description:"Get battery voltage and percentage",category:"Device Info",responseFormat:"Battery: {voltage}mV ({percentage}%)"},{name:"get_time",description:"Get device's current RTC time",category:"Device Info",responseFormat:"Epoch timestamp or formatted time string"},{name:"get_self_telemetry",description:"Get local device telemetry data",category:"Device Info",responseFormat:"Telemetry data including temperature, voltage, uptime"},{name:"set_time",description:"Set device RTC time",category:"Device Info",params:[{name:"val",type:"number",description:"Epoch seconds (Unix timestamp)",required:!0}]},{name:"set_radio",description:"Set radio parameters (frequency, bandwidth, spreading factor, coding rate)",category:"Radio Settings",params:[{name:"freq",type:"number",description:"Frequency in MHz",required:!0,min:400,max:1e3},{name:"bw",type:"number",description:"Bandwidth in kHz",required:!0,min:7.8,max:500},{name:"sf",type:"number",description:"Spreading factor",required:!0,min:5,max:12},{name:"cr",type:"number",description:"Coding rate",required:!0,min:5,max:8}],responseFormat:"OK - radio parameters set (reboot required)"},{name:"get_allowed_repeat_freq",description:"Get allowed repeater frequencies",category:"Radio Settings",responseFormat:"List of allowed frequency ranges"},{name:"set_tx_power",description:"Set transmit power",category:"Radio Settings",params:[{name:"val",type:"number",description:"TX power in dBm",required:!0,min:-9,max:22}],responseFormat:"OK - TX power set to {val}dBm"},{name:"set_radio.rxgain",description:"Set RX boosted gain mode (SX1262/SX1268 only, v1.14.1+)",category:"Radio Settings",params:[{name:"state",type:"select",description:"Enable or disable RX boosted gain",required:!0,options:["on","off"]}]},{name:"set_coords",description:"Set GPS coordinates (latitude and longitude)",category:"Location",params:[{name:"lat",type:"number",description:"Latitude in decimal degrees",required:!0,min:-90,max:90},{name:"lon",type:"number",description:"Longitude in decimal degrees",required:!0,min:-180,max:180}],responseFormat:"OK - coordinates set"},{name:"set_path_hash_mode",description:"Set path hash mode (0, 1, or 2) for routing optimization",category:"Network",params:[{name:"mode",type:"select",description:"Path hash mode (0=disabled, 1=8-bit, 2=16-bit)",required:!0,options:["0","1","2"]}]},{name:"set_flood_max",description:"Set maximum flood hops (network-wide broadcast limit)",category:"Network",params:[{name:"val",type:"number",description:"Maximum number of hops for flood messages",required:!0,min:0,max:64}],responseFormat:"OK - flood max set to {val}"},{name:"send_advert",description:"Send a local or flood advertisement",category:"Network",params:[{name:"flood",type:"boolean",description:"True for flood advert, false for local-only",required:!1,default:!1}],responseFormat:"Advertisement sent"},{name:"get_stats_core",description:"Get core mesh statistics (messages, packets, routing)",category:"Statistics",responseFormat:"Core statistics including message counts and routing info"},{name:"get_stats_radio",description:"Get radio statistics (TX/RX counts, errors, signal quality)",category:"Statistics",responseFormat:"Radio statistics including TX/RX packet counts and error rates"},{name:"get_stats_packets",description:"Get detailed packet statistics",category:"Statistics",responseFormat:"Packet-level statistics"},{name:"set_custom_var",description:"Set a custom variable (sensor data)",category:"Advanced",params:[{name:"key",type:"string",description:"Variable name",required:!0},{name:"value",type:"string",description:"Variable value",required:!0}],responseFormat:"OK - variable set"},{name:"get_custom_vars",description:"Get all custom variables",category:"Advanced",responseFormat:"Dictionary of all custom variables"},{name:"set_tuning",description:"Set timing parameters (RX delay and airtime factor)",category:"Advanced",params:[{name:"rx_dly",type:"number",description:"RX delay base",required:!0},{name:"af",type:"number",description:"Airtime factor",required:!0}]},{name:"set_name",description:"Set device name",category:"Device Info",dangerous:!0,dangerMessage:"Changing the device name will change all entity IDs. Automations, scripts, and dashboards using current entity IDs will need to be updated.",params:[{name:"name",type:"string",description:"New device name",required:!0}],responseFormat:"OK - name set to {name}"},{name:"set_multi_acks",description:"Enable or disable multi-ack mode",category:"Advanced",params:[{name:"val",type:"number",description:"Multi-acks setting (0 or 1)",required:!0,options:["0","1"]}]},{name:"set_advert_loc_policy",description:"Set location advertisement policy",category:"Network",params:[{name:"policy",type:"select",description:"Policy: 0=none, 1=prefs (saved), 2=share (live GPS)",required:!0,options:["0","1","2"]}]},{name:"set_manual_add_contacts",description:"Set manual contact adding mode",category:"Advanced",params:[{name:"flag",type:"boolean",description:"Enable manual contact addition",required:!0}]},{name:"set_telemetry_mode_base",description:"Set base telemetry mode",category:"Advanced",params:[{name:"mode",type:"number",description:"Telemetry mode",required:!0}]},{name:"set_telemetry_mode_loc",description:"Set location telemetry mode",category:"Advanced",params:[{name:"mode",type:"number",description:"Location telemetry mode",required:!0}]},{name:"set_telemetry_mode_env",description:"Set environment telemetry mode",category:"Advanced",params:[{name:"mode",type:"number",description:"Environment telemetry mode",required:!0}]},{name:"get_channel",description:"Get channel information by index",category:"Advanced",params:[{name:"channel_idx",type:"number",description:"Channel index",required:!0}]},{name:"set_channel",description:"Set channel name and optional secret",category:"Advanced",params:[{name:"channel_idx",type:"number",description:"Channel index",required:!0},{name:"name",type:"string",description:"Channel name (use # prefix for auto-derived key)",required:!0}]},{name:"export_private_key",description:"Export private key (may be disabled by firmware)",category:"Advanced",responseFormat:"Private key in hex format"},{name:"import_private_key",description:"Import private key (reboot required)",category:"Advanced",dangerous:!0,dangerMessage:"Importing a private key changes the device identity and all entity IDs. Automations, scripts, and dashboards using current entity IDs will need to be updated.",params:[{name:"key",type:"string",description:"Private key in hex format",required:!0}]},{name:"sign",description:"Sign data with the device private key",category:"Advanced",params:[{name:"data",type:"string",description:"Data to sign (hex format)",required:!0}]},{name:"send_msg",description:"Send a direct text message to a contact",category:"Messaging",params:[{name:"contact",type:"string",description:"Contact name, public key prefix, or full public key",required:!0},{name:"message",type:"string",description:"Message text",required:!0}]},{name:"send_msg_with_retry",description:"Send a message with automatic retry and path reset",category:"Messaging",params:[{name:"contact",type:"string",description:"Contact name, public key prefix, or full public key",required:!0},{name:"message",type:"string",description:"Message text",required:!0}]},{name:"send_chan_msg",description:"Send a message to a channel (group message)",category:"Messaging",params:[{name:"channel",type:"number",description:"Channel index",required:!0},{name:"message",type:"string",description:"Message text",required:!0}]},{name:"send_cmd",description:"Send a CLI command to a remote node over the mesh",category:"Messaging",params:[{name:"contact",type:"string",description:"Contact name, public key prefix, or full public key",required:!0},{name:"command",type:"string",description:"CLI command to execute on remote node",required:!0}]},{name:"send_login",description:"Login to a remote node with admin password",category:"Messaging",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0},{name:"password",type:"string",description:"Admin password",required:!0}]},{name:"send_logout",description:"Logout from a remote node",category:"Messaging",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"send_statusreq",description:"Request status from a remote node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"send_telemetry_req",description:"Request telemetry data from a remote node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"send_path_discovery",description:"Initiate path discovery to a remote node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_status_sync",description:"Request status from a node (synchronous)",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_telemetry_sync",description:"Request telemetry data from a node (synchronous)",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_mma_sync",description:"Request min/max/avg statistics for a time range",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0},{name:"start",type:"number",description:"Start time (epoch seconds)",required:!0},{name:"end",type:"number",description:"End time (epoch seconds)",required:!0}]},{name:"req_acl_sync",description:"Request access control list from a node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_neighbours_sync",description:"Request neighbor list from a remote node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"fetch_all_neighbours",description:"Fetch complete neighbor list with pagination",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_regions_sync",description:"Request region information from a node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_owner_sync",description:"Request owner information (name and description)",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"req_basic_sync",description:"Request basic node information",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"get_contacts",description:"Retrieve all known contacts from the device",category:"Advanced",params:[{name:"lastmod",type:"number",description:"Only get contacts modified since this timestamp (optional)",required:!1}]},{name:"reset_path",description:"Reset routing path to flood for a contact",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"share_contact",description:"Share a contact info on the mesh",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"export_contact",description:"Export a contact card (or self if no contact specified)",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key (optional, defaults to self)",required:!1}]},{name:"import_contact",description:"Import a contact card",category:"Advanced",params:[{name:"card_data",type:"string",description:"Contact card data (hex encoded)",required:!0}]},{name:"remove_contact",description:"Remove a contact from the list",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"update_contact",description:"Update contact routing path and flags",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0},{name:"path",type:"string",description:"Routing path (hex string)",required:!0},{name:"flags",type:"string",description:"Contact flags",required:!0}]},{name:"add_contact",description:"Add a contact to the list",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0}]},{name:"change_contact_path",description:"Change a contact routing path",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0},{name:"path",type:"number",description:"New path (integer)",required:!0}]},{name:"change_contact_flags",description:"Change a contact flags",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0},{name:"flags",type:"number",description:"New flags (integer)",required:!0}]},{name:"set_autoadd_config",description:"Configure auto-add behavior for new contacts",category:"Advanced",params:[{name:"flag",type:"number",description:"Auto-add configuration flag",required:!0}]},{name:"get_autoadd_config",description:"Get current auto-add configuration",category:"Advanced"},{name:"send_binary_req",description:"Send a raw binary request to a remote node",category:"Advanced",params:[{name:"contact",type:"string",description:"Contact name or public key",required:!0},{name:"req_type",type:"number",description:"Binary request type",required:!0}]},{name:"set_flood_scope",description:"Set flood scope filter for broadcast messages",category:"Network",params:[{name:"scope",type:"string",description:"Flood scope (int, string, or hex)",required:!0}]},{name:"send_control_data",description:"Send raw control data packet to the mesh",category:"Advanced",params:[{name:"control_type",type:"number",description:"Control data type",required:!0},{name:"payload",type:"string",description:"Payload data (hex encoded)",required:!0}]},{name:"send_node_discover_req",description:"Broadcast node discovery request",category:"Network",params:[{name:"filter",type:"number",description:"Discovery filter",required:!0},{name:"prefix_only",type:"boolean",description:"Only use public key prefix for matching",required:!1,default:!1}]},{name:"get_msg",description:"Retrieve pending incoming messages",category:"Messaging",params:[{name:"timeout",type:"number",description:"Timeout in seconds to wait for messages (optional)",required:!1,default:5}]},{name:"send_trace",description:"Send a trace packet through specific repeaters",category:"Advanced",params:[{name:"auth_code",type:"number",description:"Authentication code",required:!0},{name:"tag",type:"number",description:"Trace tag",required:!0},{name:"flags",type:"number",description:"Trace flags",required:!0},{name:"path",type:"string",description:"Optional repeater path (hex encoded)",required:!1}]}],Ye=[{name:"reboot",description:"Restart the remote device",category:"Device Management",dangerous:!0,remoteOnly:!0},{name:"poweroff",description:"Power off the remote device (v1.14.1+)",category:"Device Management",dangerous:!0,remoteOnly:!0},{name:"shutdown",description:"Power off the remote device (alias for poweroff)",category:"Device Management",dangerous:!0,remoteOnly:!0},{name:"clkreboot",description:"Reset clock to May 2024 and reboot",category:"Device Management",dangerous:!0,remoteOnly:!0},{name:"get name",description:"Get device name",category:"Device Info",responseFormat:"> Device name string",remoteOnly:!0},{name:"get radio",description:"Get radio parameters (frequency, bandwidth, spreading factor, coding rate)",category:"Radio Settings",responseFormat:"> freq,bw,sf,cr (example: 906.875,250.000,11,5)",remoteOnly:!0},{name:"get freq",description:"Get frequency only",category:"Radio Settings",responseFormat:"> frequency in MHz (example: 906.875)",remoteOnly:!0},{name:"get tx",description:"Get transmit power",category:"Radio Settings",responseFormat:"> TX power in dBm (example: 17)",remoteOnly:!0},{name:"get af",description:"Get airtime factor",category:"Radio Settings",responseFormat:"> airtime factor value",remoteOnly:!0},{name:"get lat",description:"Get latitude coordinate",category:"Location",responseFormat:"> latitude as float (example: 45.123456)",remoteOnly:!0},{name:"get lon",description:"Get longitude coordinate",category:"Location",responseFormat:"> longitude as float (example: -122.654321)",remoteOnly:!0},{name:"get repeat",description:"Get forwarding/repeating status",category:"Network",responseFormat:"> on or off",remoteOnly:!0},{name:"get rxdelay",description:"Get RX delay base",category:"Advanced",responseFormat:"> RX delay value",remoteOnly:!0},{name:"get txdelay",description:"Get TX delay factor",category:"Advanced",responseFormat:"> TX delay value",remoteOnly:!0},{name:"get direct.txdelay",description:"Get direct TX delay factor",category:"Advanced",responseFormat:"> Direct TX delay value",remoteOnly:!0},{name:"get flood.max",description:"Get maximum flood hops",category:"Network",responseFormat:"> max hops value (example: 8)",remoteOnly:!0},{name:"get advert.interval",description:"Get local advertisement interval (minutes)",category:"Network",responseFormat:"> interval in minutes (example: 120)",remoteOnly:!0},{name:"get flood.advert.interval",description:"Get flood advertisement interval (hours)",category:"Network",responseFormat:"> interval in hours (example: 12)",remoteOnly:!0},{name:"get int.thresh",description:"Get interference threshold",category:"Advanced",responseFormat:"> threshold value",remoteOnly:!0},{name:"get agc.reset.interval",description:"Get AGC (automatic gain control) reset interval",category:"Advanced",responseFormat:"> interval value",remoteOnly:!0},{name:"get multi.acks",description:"Get multi-acks setting",category:"Advanced",responseFormat:"> multi-acks value (0 or 1)",remoteOnly:!0},{name:"get allow.read.only",description:"Get read-only access permission setting",category:"Advanced",responseFormat:"> on or off",remoteOnly:!0},{name:"get guest.password",description:"Get guest password",category:"Advanced",responseFormat:"> password string",remoteOnly:!0},{name:"get public.key",description:"Get full public key (hex)",category:"Device Info",responseFormat:"> hex-encoded public key (example: a6ec829f...d9b70772)",remoteOnly:!0},{name:"get role",description:"Get device role",category:"Device Info",responseFormat:"> repeater or client",remoteOnly:!0},{name:"get owner.info",description:"Get owner information text",category:"Device Info",responseFormat:"> owner info string (with | for newlines)",remoteOnly:!0},{name:"get adc.multiplier",description:"Get ADC voltage multiplier",category:"Advanced",responseFormat:"> multiplier value",remoteOnly:!0},{name:"get path.hash.mode",description:"Get path hash mode (v1.14.0+)",category:"Network",responseFormat:"> mode: 0, 1, or 2",remoteOnly:!0},{name:"get loop.detect",description:"Get loop detection level (v1.14.0+)",category:"Network",responseFormat:"> off, minimal, moderate, or strict",remoteOnly:!0},{name:"get bootloader.ver",description:"Get bootloader version (NRF52 only, v1.14.0+)",category:"Device Info",responseFormat:"> bootloader version string",remoteOnly:!0},{name:"get radio.rxgain",description:"Get RX boosted gain mode (SX1262/SX1268 only, v1.14.1+)",category:"Radio Settings",responseFormat:"> on or off",remoteOnly:!0},{name:"get bridge.type",description:"Get bridge hardware type",category:"Advanced",responseFormat:"> none, rs232, or espnow",remoteOnly:!0},{name:"set name",description:"Set device name",category:"Device Info",params:[{name:"name",type:"string",description:"New name (no special characters: []\\:,?*)",required:!0}],responseFormat:"OK - name changed",remoteOnly:!0},{name:"set af",description:"Set airtime factor",category:"Radio Settings",params:[{name:"val",type:"number",description:"Airtime factor (0-9)",required:!0,min:0,max:9}],responseFormat:"OK - airtime factor set",remoteOnly:!0},{name:"set repeat",description:"Enable or disable packet forwarding/repeating",category:"Network",params:[{name:"state",type:"select",description:"Enable (on) or disable (off)",required:!0,options:["on","off"]}],responseFormat:"OK - forwarding enabled/disabled",remoteOnly:!0},{name:"set radio",description:"Set radio parameters (reboot required to take effect)",category:"Radio Settings",params:[{name:"params",type:"string",description:"Comma-separated: freq,bw,sf,cr (example: 906.875,250.000,11,5)",required:!0}],responseFormat:"OK - radio parameters set (reboot required)",remoteOnly:!0},{name:"set lat",description:"Set latitude coordinate",category:"Location",params:[{name:"val",type:"number",description:"Latitude (-90 to 90)",required:!0,min:-90,max:90}],responseFormat:"OK - latitude set",remoteOnly:!0},{name:"set lon",description:"Set longitude coordinate",category:"Location",params:[{name:"val",type:"number",description:"Longitude (-180 to 180)",required:!0,min:-180,max:180}],responseFormat:"OK - longitude set",remoteOnly:!0},{name:"set tx",description:"Set transmit power",category:"Radio Settings",params:[{name:"val",type:"number",description:"TX power in dBm",required:!0,min:-9,max:22}],responseFormat:"OK - TX power set",remoteOnly:!0},{name:"set rxdelay",description:"Set RX delay base",category:"Advanced",params:[{name:"val",type:"number",description:"RX delay value (≥0)",required:!0,min:0}],responseFormat:"OK - RX delay set",remoteOnly:!0},{name:"set txdelay",description:"Set TX delay factor",category:"Advanced",params:[{name:"val",type:"number",description:"TX delay value (≥0)",required:!0,min:0}],responseFormat:"OK - TX delay set",remoteOnly:!0},{name:"set direct.txdelay",description:"Set direct TX delay factor",category:"Advanced",params:[{name:"val",type:"number",description:"Direct TX delay value (≥0)",required:!0,min:0}],responseFormat:"OK - direct TX delay set",remoteOnly:!0},{name:"set flood.max",description:"Set maximum flood hops",category:"Network",params:[{name:"val",type:"number",description:"Max hops (0-64)",required:!0,min:0,max:64}],responseFormat:"OK - flood max set",remoteOnly:!0},{name:"set advert.interval",description:"Set local advertisement interval (minutes)",category:"Network",params:[{name:"val",type:"number",description:"Interval in minutes (60-240, or 0 to disable)",required:!0,min:0,max:240}],responseFormat:"OK - advert interval set",remoteOnly:!0},{name:"set flood.advert.interval",description:"Set flood advertisement interval (hours)",category:"Network",params:[{name:"val",type:"number",description:"Interval in hours (3-168, or 0 to disable)",required:!0,min:0,max:168}],responseFormat:"OK - flood advert interval set",remoteOnly:!0},{name:"set int.thresh",description:"Set interference threshold",category:"Advanced",params:[{name:"val",type:"number",description:"Threshold value",required:!0}],responseFormat:"OK - interference threshold set",remoteOnly:!0},{name:"set agc.reset.interval",description:"Set AGC (automatic gain control) reset interval",category:"Advanced",params:[{name:"val",type:"number",description:"Interval value",required:!0}],responseFormat:"OK - AGC reset interval set",remoteOnly:!0},{name:"set multi.acks",description:"Set multi-acks mode",category:"Advanced",params:[{name:"val",type:"number",description:"Multi-acks setting (0 or 1)",required:!0,min:0,max:1}],responseFormat:"OK - multi-acks set",remoteOnly:!0},{name:"set allow.read.only",description:"Set read-only access permission",category:"Advanced",params:[{name:"state",type:"select",description:"Enable (on) or disable (off)",required:!0,options:["on","off"]}],responseFormat:"OK - read-only access updated",remoteOnly:!0},{name:"set guest.password",description:"Set guest password",category:"Advanced",params:[{name:"pwd",type:"string",description:"New guest password",required:!0}],responseFormat:"OK - guest password set",remoteOnly:!0},{name:"set prv.key",description:"Import private key (reboot required, serial-only)",category:"Advanced",params:[{name:"hex",type:"string",description:"64-character hex private key",required:!0}],responseFormat:"OK - private key imported (reboot required)",remoteOnly:!0},{name:"set owner.info",description:"Set owner information text",category:"Device Info",params:[{name:"text",type:"string",description:"Owner info (use | for newlines)",required:!0}],responseFormat:"OK - owner info set",remoteOnly:!0},{name:"set adc.multiplier",description:"Set ADC voltage multiplier",category:"Advanced",params:[{name:"val",type:"number",description:"Multiplier value (0-10, 0 = board default)",required:!0,min:0,max:10}],responseFormat:"OK - ADC multiplier set",remoteOnly:!0},{name:"set path.hash.mode",description:"Set path hash mode for routing (v1.14.0+)",category:"Network",params:[{name:"mode",type:"select",description:"Mode: 0=disabled, 1=8-bit, 2=16-bit",required:!0,options:["0","1","2"]}],responseFormat:"OK - path hash mode set",remoteOnly:!0},{name:"set loop.detect",description:"Set loop detection level (v1.14.0+)",category:"Network",params:[{name:"mode",type:"select",description:"Mode: off, minimal, moderate, or strict",required:!0,options:["off","minimal","moderate","strict"]}],responseFormat:"OK - loop detection set",remoteOnly:!0},{name:"set radio.rxgain",description:"Set RX boosted gain mode (SX1262/SX1268 only, v1.14.1+)",category:"Radio Settings",params:[{name:"state",type:"select",description:"Enable (on) or disable (off)",required:!0,options:["on","off"]}],responseFormat:"OK - RX gain mode set",remoteOnly:!0},{name:"set bridge.enabled",description:"Enable or disable the bridge interface",category:"Advanced",params:[{name:"state",type:"select",description:"Enable (on) or disable (off)",required:!0,options:["on","off"]}],responseFormat:"OK - bridge enabled/disabled",remoteOnly:!0},{name:"set bridge.delay",description:"Set bridge packet delay",category:"Advanced",params:[{name:"ms",type:"number",description:"Delay in milliseconds (0-10000)",required:!0,min:0,max:1e4}],responseFormat:"OK - bridge delay set",remoteOnly:!0},{name:"set bridge.source",description:"Set bridge packet source (RX or TX logs)",category:"Advanced",params:[{name:"source",type:"select",description:"Source: rx (logRx) or tx (logTx)",required:!0,options:["rx","tx"]}],responseFormat:"OK - bridge source set",remoteOnly:!0},{name:"set bridge.baud",description:"Set RS232 bridge baud rate",category:"Advanced",params:[{name:"rate",type:"number",description:"Baud rate (9600-115200, board-dependent max)",required:!0,min:9600}],responseFormat:"OK - bridge baud rate set",remoteOnly:!0},{name:"set bridge.channel",description:"Set ESP-NOW bridge channel",category:"Advanced",params:[{name:"ch",type:"number",description:"Channel (1-14)",required:!0,min:1,max:14}],responseFormat:"OK - bridge channel set",remoteOnly:!0},{name:"set bridge.secret",description:"Set ESP-NOW bridge shared secret",category:"Advanced",params:[{name:"key",type:"string",description:"Shared secret string",required:!0}],responseFormat:"OK - bridge secret set",remoteOnly:!0},{name:"ver",description:"Get firmware version and build date",category:"Device Info",responseFormat:"<version> (Build: <date>)",remoteOnly:!0},{name:"board",description:"Get board/manufacturer name",category:"Device Info",responseFormat:"Board name string",remoteOnly:!0},{name:"neighbors",description:"List known neighbor nodes",category:"Network",responseFormat:"Formatted neighbor list",remoteOnly:!0},{name:"neighbor.remove",description:"Remove a neighbor by public key",category:"Network",params:[{name:"pubkey",type:"string",description:"Public key hex string of neighbor to remove",required:!0}],responseFormat:"OK - neighbor removed",remoteOnly:!0},{name:"clock",description:"Get current device time",category:"Device Info",responseFormat:"HH:MM - D/M/Y UTC",remoteOnly:!0},{name:"clock sync",description:"Synchronize clock to sender's timestamp",category:"Device Info",responseFormat:"OK - clock set: HH:MM - D/M/Y UTC",remoteOnly:!0},{name:"time",description:"Set time to epoch seconds",category:"Device Info",params:[{name:"epoch",type:"number",description:"Unix epoch timestamp",required:!0}],responseFormat:"OK - clock set: HH:MM - D/M/Y UTC",remoteOnly:!0},{name:"password",description:"Change admin password (requires prior login)",category:"Advanced",params:[{name:"pwd",type:"string",description:"New admin password",required:!0}],responseFormat:"password now: <pwd>",remoteOnly:!0},{name:"advert",description:"Send a flood advertisement (network-wide broadcast)",category:"Network",responseFormat:"OK - Advert sent",remoteOnly:!0},{name:"advert.zerohop",description:"Send a local-only (zero-hop) advertisement (v1.14.0+)",category:"Network",responseFormat:"OK - zerohop advert sent",remoteOnly:!0},{name:"clear stats",description:"Reset all statistics counters",category:"Advanced",responseFormat:"OK - stats reset",remoteOnly:!0},{name:"log start",description:"Start packet logging",category:"Advanced",responseFormat:"logging on",remoteOnly:!0},{name:"log stop",description:"Stop packet logging",category:"Advanced",responseFormat:"logging off",remoteOnly:!0},{name:"log erase",description:"Erase log file",category:"Advanced",responseFormat:"log erased",remoteOnly:!0},{name:"powersaving",description:"Get power saving status (NRF52 only)",category:"Device Info",responseFormat:"on or off",remoteOnly:!0},{name:"powersaving on",description:"Enable power saving mode (NRF52 only)",category:"Device Info",responseFormat:"ok",remoteOnly:!0},{name:"powersaving off",description:"Disable power saving mode (NRF52 only)",category:"Device Info",responseFormat:"ok",remoteOnly:!0},{name:"start ota",description:"Enter Bluetooth OTA update mode (repeater-only)",category:"Device Management",dangerous:!0,remoteOnly:!0},{name:"tempradio",description:"Temporarily override radio parameters for a duration",category:"Radio Settings",params:[{name:"freq",type:"number",description:"Temporary frequency in MHz",required:!0},{name:"bw",type:"number",description:"Temporary bandwidth in kHz",required:!0},{name:"sf",type:"number",description:"Temporary spreading factor (5-12)",required:!0},{name:"cr",type:"number",description:"Temporary coding rate (5-8)",required:!0},{name:"mins",type:"number",description:"Duration in minutes",required:!0}],responseFormat:"OK - temp params for N mins",remoteOnly:!0}];var Je;let Ze=Je=class extends de{constructor(){super(...arguments),this.open=!1,this.isLocal=!1,this.narrow=!1,this._selectedCommand=null,this._paramValues={},this._response=null,this._executing=!1,this._error=null}_getCommands(){return this.isLocal?Qe:Ye}_getGroupedCommands(){const e=this._getCommands(),t=new Map;for(const i of e)t.has(i.category)||t.set(i.category,[]),t.get(i.category).push(i);return t}render(){if(!this.open)return;const e=this._getGroupedCommands();return j`
      <div
        class="dialog-overlay"
        @click=${this._onOverlayClick}>
        <div class="dialog">
          <div class="dialog-header">
            <div style="flex: 1;">
              <div class="dialog-header-title">Issue Command</div>
              ${this.targetPrefix?j`<div style="font-size: 12px; color: var(--secondary-text-color); margin-top: 4px;">
                    Target: ${this.targetPrefix}
                  </div>`:""}
            </div>
          </div>
          <div class="dialog-body">
            <!-- Command Selection -->
            <div class="form-group">
              <label class="form-label">Command</label>
              <select
                class="command-select"
                @change=${this._onCommandSelected}>
                <option value="">-- Select a command --</option>
                ${Array.from(e.entries()).map(([e,t])=>j`<optgroup label=${e}>
                      ${t.map(e=>j`<option value=${e.name}>
                            ${e.name} - ${e.description}
                          </option>`)}
                    </optgroup>`)}
              </select>
            </div>

            <!-- Command Details -->
            ${this._selectedCommand?j`
                  <div class="command-description">
                    <strong>${this._selectedCommand.name}</strong><br />
                    ${this._selectedCommand.description}
                  </div>

                  ${this._selectedCommand.dangerous?j`<div class="danger-warning">
                        <span class="danger-warning-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg></span>
                        <span>${this._selectedCommand.dangerMessage||"This is a dangerous operation"}</span>
                      </div>`:""}

                  <!-- Parameters -->
                  ${this._selectedCommand.params&&this._selectedCommand.params.length>0?j`
                        <div class="command-params">
                          <label class="form-label">Parameters</label>
                          ${this._selectedCommand.params.map(e=>this._renderParamInput(e))}
                        </div>
                      `:""}

                  <!-- Expected Response -->
                  ${this._selectedCommand.responseFormat?j`<div style="margin-top: 12px; font-size: 12px; color: var(--secondary-text-color); font-style: italic;">
                        Expected: ${this._selectedCommand.responseFormat}
                      </div>`:""}

                  <!-- Execute Button -->
                  <button
                    class="apply-button"
                    style="width: 100%; margin-top: 12px;"
                    ?disabled=${this._executing}
                    @click=${this._executeCommand}>
                    ${this._executing?"Executing...":"Execute"}
                  </button>

                  <!-- Response Display -->
                  ${this._response||this._error?j`
                        <div class="form-group" style="margin-top: 16px;">
                          <label class="form-label">Response</label>
                          <div
                            class="command-response"
                            style=${this._error?"color: var(--error-color, #db4437);":""}>
                            ${this._error?this._error:this._renderFormattedResponse(this._response)}
                          </div>
                        </div>
                      `:""}
                `:""}
          </div>
          <div class="dialog-footer">
            <button
              class="dialog-button"
              @click=${this._onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    `}_renderParamInput(e){const t=this._paramValues[e.name]??e.default??"";switch(e.type){case"boolean":return j`
          <div class="form-group">
            <label class="form-toggle">
              <input
                type="checkbox"
                ?checked=${!!t}
                @change=${t=>{this._paramValues[e.name]=t.target.checked}}
              />
              <span class="form-toggle-label">${e.name}</span>
            </label>
            ${e.description?j`<div class="form-description">${e.description}</div>`:""}
          </div>
        `;case"select":return j`
          <div class="form-group">
            <label class="form-label">${e.name}</label>
            <select
              class="form-select"
              @change=${t=>{this._paramValues[e.name]=t.target.value}}>
              <option value="" ?selected=${!t}>-- Select --</option>
              ${(e.options||[]).map(e=>j`<option value=${e} ?selected=${String(t)===String(e)}>${e}</option>`)}
            </select>
            ${e.description?j`<div class="form-description">${e.description}</div>`:""}
          </div>
        `;case"number":return j`
          <div class="form-group">
            <label class="form-label">${e.name}</label>
            <input
              type="number"
              class="form-input"
              ?required=${e.required}
              ?min=${e.min}
              ?max=${e.max}
              .value=${String(t)}
              @input=${t=>{const i=t.target;this._paramValues[e.name]=i.value?Number(i.value):""}}
            />
            ${e.description?j`<div class="form-description">${e.description}</div>`:""}
          </div>
        `;default:return j`
          <div class="form-group">
            <label class="form-label">${e.name}</label>
            <input
              type="text"
              class="form-input"
              ?required=${e.required}
              .value=${String(t)}
              @input=${t=>{this._paramValues[e.name]=t.target.value}}
            />
            ${e.description?j`<div class="form-description">${e.description}</div>`:""}
          </div>
        `}}_formatValue(e){return!0===e?"Yes":!1===e?"No":null==e?"—":("string"==typeof e&&e.length,String(e))}_renderFormattedResponse(e){try{const t=JSON.parse(e);if(t&&"object"==typeof t&&!Array.isArray(t)){const e=Object.entries(t);if(e.length>0)return j`
            <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px;">
              ${e.map(([e,t])=>{const i=Je._FRIENDLY_LABELS[e]||e.replace(/_/g," ").replace(/\b\w/g,e=>e.toUpperCase()),o=this._formatValue(t),r="string"==typeof t&&t.length>24;return j`
                  <div style="color: var(--secondary-text-color); white-space: nowrap;">${i}</div>
                  <div style="font-family: var(--code-font-family, monospace); word-break: ${r?"break-all":"normal"};">${o}</div>
                `})}
            </div>
          `}if(Array.isArray(t))return j`<pre style="margin: 0; white-space: pre-wrap; font-size: 13px;">${JSON.stringify(t,null,2)}</pre>`}catch{}return e}_onCommandSelected(e){const t=e.target.value,i=this._getCommands();this._selectedCommand=i.find(e=>e.name===t)||null,this._paramValues={},this._response=null,this._error=null}async _executeCommand(){if(this._selectedCommand&&this.hass){this._executing=!0,this._response=null,this._error=null;try{let e;if(this.isLocal)e=await Se(this.hass,this._selectedCommand.name,Object.keys(this._paramValues).length>0?this._paramValues:void 0,this.entryId);else{if(!this.targetPrefix)return void(this._error="No target device specified");const t=this._paramValues;let i=this._selectedCommand.name;if(Object.keys(t).length>0){const e=Object.entries(t).map(([,e])=>String(e)).join(" ");i=`${i} ${e}`}e=await Me(this.hass,this.targetPrefix,i,this.entryId)}e.success?this._response=e.response:this._error=e.response||"Command execution failed"}catch(e){this._error=`Error: ${String(e)}`}finally{this._executing=!1}}}_onOverlayClick(e){e.target===e.currentTarget&&this._onClose()}_onClose(){this._selectedCommand=null,this._paramValues={},this._response=null,this._error=null,this.dispatchEvent(new CustomEvent("close",{bubbles:!0}))}};function et(e){const t=e.entity_id,i=e.original_device_class??null;if(t.startsWith("binary_sensor.meshcore_")&&"connectivity"===i)return null;if(t.startsWith("binary_sensor.meshcore_"))return null;if(t.includes("node_status")||t.includes("companion_prefix")||t.includes("request_rate")||t.includes("delivery")||t.includes("path_")||t.includes("neighbor_"))return null;if("battery"===i)return{entity_id:t,label:"Battery",icon:"battery",colorScheme:"battery",sortOrder:1};if("voltage"===i)return{entity_id:t,label:"Voltage",icon:"power",colorScheme:"neutral",sortOrder:2};if("duration"===i)return{entity_id:t,label:"Uptime",icon:"clock",colorScheme:"neutral",sortOrder:3};if("signal_strength"===i)return{entity_id:t,label:"TX Power",icon:"power",colorScheme:"neutral",sortOrder:6};if("temperature"===i)return{entity_id:t,label:"Temperature",icon:"thermometer",colorScheme:"neutral",sortOrder:7};if("power_factor"===i){const e=t.includes("rx_")?"RX Airtime Util":"Airtime Util";return{entity_id:t,label:e,icon:"chart",colorScheme:"neutral",sortOrder:10}}if(t.includes("snr")&&!t.includes("neighbor"))return{entity_id:t,label:"SNR",icon:"signal",colorScheme:"signal",sortOrder:4};if(t.includes("rssi"))return{entity_id:t,label:"RSSI",icon:"signal",colorScheme:"signal",sortOrder:5};if(t.includes("contact_count"))return{entity_id:t,label:"Contacts",icon:"counter",colorScheme:"neutral",sortOrder:8};if(t.includes("airtime")||t.includes("air_util"))return{entity_id:t,label:"Airtime",icon:"chart",colorScheme:"neutral",sortOrder:9};if(t.includes("channel_util"))return{entity_id:t,label:"Channel Util",icon:"chart",colorScheme:"neutral",sortOrder:10};if(t.startsWith("sensor.meshcore_")){const i=e.original_name||e.name||t.split(".")[1];return{entity_id:t,label:i,icon:"",colorScheme:"neutral",sortOrder:99}}return null}async function tt(e){const[t,i]=await Promise.all([e.callWS({type:"config/device_registry/list"}),e.callWS({type:"config/entity_registry/list"})]),o={};for(const e of t)if(e.identifiers)for(const[t,i]of e.identifiers)"meshcore"===t&&(o[i]=e.id);const r={};for(const e of i){if(!e.device_id||e.disabled_by)continue;if(!e.entity_id.startsWith("sensor.meshcore_")&&!e.entity_id.startsWith("binary_sensor.meshcore_"))continue;const t=et(e);t&&(r[e.device_id]||(r[e.device_id]=[]),r[e.device_id].push(t))}for(const e of Object.keys(r))r[e].sort((e,t)=>e.sortOrder-t.sortOrder);return{meshcoreDeviceMap:o,deviceEntities:r}}Ze.styles=[ve,a`
      :host {
        display: block;
      }

      :host([narrow]) .dialog {
        max-width: 100%;
      }

      .dialog {
        max-width: 500px;
      }

      .danger-warning {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        margin: 8px 0;
        background: rgba(219, 68, 55, 0.1);
        border: 1px solid var(--error-color, #db4437);
        border-radius: 6px;
        font-size: 12px;
        color: var(--error-color, #db4437);
      }

      .danger-warning-icon {
        font-size: 16px;
        flex-shrink: 0;
      }
    `],Ze._FRIENDLY_LABELS={adv_type:"Device Type",tx_power:"TX Power (dBm)",max_tx_power:"Max TX Power (dBm)",public_key:"Public Key",adv_lat:"Latitude",adv_lon:"Longitude",multi_acks:"Multi-Acks",adv_loc_policy:"Location Ad Policy",telemetry_mode_env:"Telemetry: Environment",telemetry_mode_loc:"Telemetry: Location",telemetry_mode_base:"Telemetry: Base",manual_add_contacts:"Manual Add Contacts",radio_freq:"Frequency (MHz)",radio_bw:"Bandwidth (kHz)",radio_sf:"Spreading Factor",radio_cr:"Coding Rate",name:"Name",path_hash_mode:"Path Hash Mode",firmware_ver:"Firmware Version",board_type:"Board Type",suggested_timeout:"Suggested Timeout (ms)",capabilities:"Capabilities",voltage:"Voltage (mV)",percentage:"Battery (%)",uptime:"Uptime (s)",temperature:"Temperature"},e([me({type:Boolean})],Ze.prototype,"open",void 0),e([me({type:Object})],Ze.prototype,"hass",void 0),e([me({type:String})],Ze.prototype,"entryId",void 0),e([me({type:String})],Ze.prototype,"targetPrefix",void 0),e([me({type:Boolean})],Ze.prototype,"isLocal",void 0),e([me({type:Boolean})],Ze.prototype,"narrow",void 0),e([ue()],Ze.prototype,"_selectedCommand",void 0),e([ue()],Ze.prototype,"_paramValues",void 0),e([ue()],Ze.prototype,"_response",void 0),e([ue()],Ze.prototype,"_executing",void 0),e([ue()],Ze.prototype,"_error",void 0),Ze=Je=e([pe("meshcore-command-dialog")],Ze);let it=class extends de{constructor(){super(...arguments),this.narrow=!1,this._managedDevices={repeaters:[],clients:[]},this._loading=!0,this._error=null,this._confirmAction=null,this._confirmDialogOpen=!1,this._commandDialogOpen=!1,this._commandDialogTarget="",this._commandDialogIsLocal=!1,this._statusMessage=null,this._statusMessageTimeout=null,this._deviceEntities={},this._meshcoreDeviceMap={},this._entityRegistryLoaded=!1,this._hiddenSensors={},this._contextMenu=null,this._overlayPointerStarted=!1,this._settingsDeviceKey=null,this._hiddenSensorsModalKey=null,this._neighborContextMenu=null,this._neighborData={}}connectedCallback(){super.connectedCallback(),this._loadHiddenSensors(),this._loadManagedDevices()}disconnectedCallback(){super.disconnectedCallback(),null!==this._statusMessageTimeout&&(clearTimeout(this._statusMessageTimeout),this._statusMessageTimeout=null)}updated(e){e.has("config")&&this._loadManagedDevices(),e.has("hass")&&this.hass&&!this._entityRegistryLoaded&&this._loadEntityRegistry()}render(){return this.hass?j`
      <div class="devices-layout">
        <div class="content-area">
          ${this._error?j`<div class="error-state"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg> ${this._error}</div>`:W}

          ${this._loading?j`<div class="loading-state"><div class="loading-spinner"></div> Loading devices...</div>`:j`
                ${this._renderDeviceSections(this._managedDevices.repeaters,"repeater")}
                ${this._renderDeviceSections(this._managedDevices.clients,"client")}
                ${0===this._managedDevices.repeaters.length&&0===this._managedDevices.clients.length?j`
                      <div class="empty-state">
                        <div class="empty-text">No managed devices</div>
                        <div class="empty-subtext">Add repeaters or clients in Settings → Integration to manage them here.</div>
                      </div>
                    `:W}
              `}
        </div>
      </div>

      <!-- Confirmation Dialog -->
      <meshcore-confirm-dialog
        .open=${this._confirmDialogOpen}
        .title=${this._confirmAction?.title||""}
        .message=${this._confirmAction?.message||""}
        @confirm=${this._onConfirmAction}
        @cancel=${this._onConfirmCancel}>
      </meshcore-confirm-dialog>

      <!-- Command Dialog -->
      <meshcore-command-dialog
        .open=${this._commandDialogOpen}
        .hass=${this.hass}
        .entryId=${this.config?.node_prefix}
        .targetPrefix=${this._commandDialogTarget}
        ?isLocal=${this._commandDialogIsLocal}
        ?narrow=${this.narrow}
        @close=${this._onCommandDialogClose}>
      </meshcore-command-dialog>

      <!-- Tile Context Menu Modal -->
      ${this._contextMenu?j`
        <div class="modal-overlay"
             @pointerdown=${this._onOverlayPointerDown}
             @click=${this._closeContextMenu}>
          <div class="modal-card" @click=${e=>e.stopPropagation()}
               @pointerdown=${e=>e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${this._contextMenu.label}</span>
              <button class="modal-close" @click=${this._dismissContextMenu}
                      @pointerdown=${e=>e.stopPropagation()}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action danger" @click=${this._hideSensorFromContext}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                Hide Sensor
              </button>
            </div>
          </div>
        </div>
      `:W}

      <!-- Neighbor Context Menu Modal -->
      ${this._neighborContextMenu?j`
        <div class="modal-overlay"
             @pointerdown=${this._onOverlayPointerDown}
             @click=${this._closeNeighborContextMenu}>
          <div class="modal-card" @click=${e=>e.stopPropagation()}
               @pointerdown=${e=>e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${this._neighborContextMenu.name}</span>
              <button class="modal-close" @click=${this._dismissNeighborContextMenu}
                      @pointerdown=${e=>e.stopPropagation()}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action danger" @click=${this._removeNeighborFromContext}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></span>
                Remove Neighbor
              </button>
            </div>
          </div>
        </div>
      `:W}

      <!-- Settings Modal -->
      ${this._settingsDeviceKey?(()=>{const e=this._getSettingsDeviceContext();return e?j`
        <div class="modal-overlay" @click=${this._closeSettingsModal}>
          <div class="modal-card" @click=${e=>e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${e.name} Settings</span>
              <button class="modal-close" @click=${this._closeSettingsModal}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action" @click=${this._openHiddenSensorsList}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                View Hidden Sensors (${(this._hiddenSensors[this._settingsDeviceKey]||[]).length})
              </button>

              <!-- Issue Command -->
              <button class="modal-action" ?disabled=${!e.isOnline} @click=${()=>{this._closeSettingsModal(),this._openCommandDialog(e.device,!1)}}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 19V7H4v12h16m0-16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h16m-7 14v-2h5v2h-5m-3.42-4L5.57 9H8.4l3.3 3.3c.39.39.39 1.03 0 1.42L8.42 17H5.59l4-4z"/></svg></span>
                Issue Command
              </button>

              <div class="modal-divider"></div>

              <!-- Reboot -->
              <button class="modal-action danger" ?disabled=${!e.isOnline} @click=${()=>{this._closeSettingsModal(),this._confirmActionDialog(`Reboot ${e.name}?`,"The device will restart.",()=>this._executeRemoteAction(e.device,"reboot"))}}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></span>
                Reboot Device
              </button>

              <!-- Start OTA (repeaters only) -->
              ${"repeater"===e.type?j`
                <button class="modal-action danger" ?disabled=${!e.isOnline} @click=${()=>{this._closeSettingsModal(),this._confirmActionDialog(`Start OTA on ${e.name}?`,"The device will enter update mode.",()=>this._executeRemoteAction(e.device,"start ota"))}}>
                  <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M5 18h14v2H5v-2zm4.6-2.7L5 10.7l2-1.9 2.6 2.6L17 4l2 2-9.4 9.3z"/></svg></span>
                  Start OTA Update
                </button>
              `:W}
            </div>
          </div>
        </div>
      `:W})():W}

      <!-- Hidden Sensors List Modal -->
      ${this._hiddenSensorsModalKey?this._renderHiddenSensorsModal():W}

      <!-- Status Toast -->
      ${this._statusMessage?j`<div class="status-toast ${this._statusMessage.type}">${"success"===this._statusMessage.type?"✓ ":"✗ "}${this._statusMessage.text}</div>`:W}
    `:j`<div class="content-area"><div class="loading-state"><div class="loading-spinner"></div> Initializing...</div></div>`}_renderDeviceSections(e,t){return e.map(e=>this._renderDeviceSection(e,t))}_renderDeviceSection(e,t){let i="unknown",o="Unknown";if(e.status_entity_id&&this.hass?.states[e.status_entity_id]){const t=this.hass.states[e.status_entity_id].state;"on"===t?(i="online",o="Online"):"off"===t&&(i="offline",o="Offline")}else e.status&&(i="online"===e.status?"online":"offline"===e.status?"offline":"unknown",o="online"===e.status?"Online":"offline"===e.status?"Offline":"Unknown");const r="online"===i,s=this._getManagedDeviceKey(e,t),a=this._getDeviceEntities(e,t),n=(this._hiddenSensors[s]||[]).length,c="repeater"===t&&e.neighbors_enabled,d=this._neighborData[e.pubkey_prefix];return c&&!d&&this._loadNeighbors(e),j`
      <div class="device-section" @tile-context-menu=${e=>this._onTileContextMenu(e,s)}>
        <div class="section-header">
          <div class="section-title">
            <div class="section-icon ${t}">
              ${"repeater"===t?j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`:j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`}
            </div>
            <div>
              <div class="device-name">${e.name}</div>
              <div class="device-meta">
                <span>${"repeater"===t?"Repeater":"Client"}</span>
                ${e.firmware_version?j`<span>Firmware: v${e.firmware_version.match(/(\d+\.\d+\.\d+)/)?.[1]??e.firmware_version}</span>`:W}
                <span>Key: ${e.pubkey_prefix}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="settings-btn" @click=${()=>this._settingsDeviceKey=s} title="Device settings">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
            <div class="status-badge ${i}"
                 @click=${()=>e.status_entity_id&&this._fireMoreInfo(e.status_entity_id)}
                 style="${e.status_entity_id?"cursor:pointer":""}">
              <span class="status-dot ${i}"></span>
              ${o}
            </div>
          </div>
        </div>

        ${a.length>0?j`
              <div class="subsection-label">Sensors${n>0?j` <span style="opacity:0.6">(${n} hidden)</span>`:W}</div>
              <div class="sensor-grid">
                ${a.map(e=>j`
                  <meshcore-sensor-tile
                    .hass=${this.hass}
                    .entityId=${e.entity_id}
                    .label=${e.label}
                    .icon=${e.icon}
                    .colorScheme=${e.colorScheme}>
                  </meshcore-sensor-tile>
                `)}
              </div>
            `:W}

        ${c?this._renderInlineNeighbors(e,d):W}

        <div class="actions-row">
          <button class="action-btn" ?disabled=${!r} @click=${()=>this._executeRemoteAction(e,"advert")}>Flood Advert</button>
          <button class="action-btn" ?disabled=${!r} @click=${()=>this._executeRemoteAction(e,"clock sync")}>Sync Clock</button>
          <button class="action-btn" ?disabled=${!r} @click=${()=>this._executeRemoteAction(e,"get bat")}>Req Telemetry</button>
          <button class="action-btn" ?disabled=${!r} @click=${()=>this._executeRemoteAction(e,"get uptime")}>Req Status</button>
        </div>
      </div>
    `}_renderInlineNeighbors(e,t){return!t||t.loading?j`
        <div class="neighbor-section">
          <div class="subsection-label">Neighbors</div>
          <div class="neighbor-loading"><div class="loading-spinner"></div> Loading neighbors...</div>
        </div>
      `:0===t.neighbors.length?j`
        <div class="neighbor-section">
          <div class="subsection-label">Neighbors</div>
          <div style="font-size: 13px; color: var(--secondary-text-color); padding: 8px 0;">No neighbors found</div>
        </div>
      `:j`
      <div class="neighbor-section">
        <div class="subsection-label">Neighbors (${t.neighbors.length})</div>

        ${t.chartData.length>0?j`
              <div class="chart-container">
                <meshcore-snr-chart
                  .data=${t.chartData}
                  .neighbors=${t.neighbors.map(e=>e.pubkey_prefix)}
                  width="550"
                  height="200"
                  timeRange="24">
                </meshcore-snr-chart>
              </div>
            `:W}

        <table class="neighbor-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>SNR</th>
              <th>Seen (48h)</th>
              <th>Last Heard</th>
            </tr>
          </thead>
          <tbody>
            ${t.neighbors.map(t=>j`
              <tr @contextmenu=${i=>this._onNeighborRightClick(i,t,e.pubkey_prefix)}
                  ${Ue(()=>this._onNeighborRightClick(new MouseEvent("contextmenu"),t,e.pubkey_prefix))}>
                <td><code>${t.name&&t.name!==t.pubkey_prefix.substring(0,6).toUpperCase()?`${t.name} (${t.pubkey_prefix.substring(0,6).toUpperCase()})`:t.pubkey_prefix.substring(0,6).toUpperCase()}</code></td>
                <td class=${t.snr>5?"snr-good":t.snr>=0?"snr-fair":"snr-poor"}>
                  <span class="clickable-value"
                        @click=${i=>{i.stopPropagation(),this._openNeighborMoreInfo(e.pubkey_prefix,t.pubkey_prefix,"snr")}}>
                    ${t.snr.toFixed(1)} dB
                  </span>
                </td>
                <td>
                  <span class="clickable-value"
                        @click=${i=>{i.stopPropagation(),this._openNeighborMoreInfo(e.pubkey_prefix,t.pubkey_prefix,"seen")}}>
                    ${t.seen_48h??0}×
                  </span>
                </td>
                <td>${this._formatRelativeTime(t.last_seen)}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `}async _loadEntityRegistry(){if(this.hass&&!this._entityRegistryLoaded){this._entityRegistryLoaded=!0;try{const{meshcoreDeviceMap:e,deviceEntities:t}=await tt(this.hass);this._meshcoreDeviceMap=e,this._deviceEntities=t}catch(e){console.error("Failed to load entity registry:",e)}}}_getDeviceEntities(e,t){if(!this.hass||!this.config)return[];const i=this._getManagedDeviceKey(e,t),o=new Set(this._hiddenSensors[i]||[]),r=this.selectedDevice?.entry_id||"",s=e.pubkey_prefix||"",a=`${r}_${t}_${s}`,n=this._meshcoreDeviceMap[a];if(n&&this._deviceEntities[n])return this._deviceEntities[n].filter(e=>!o.has(e.entity_id));for(const[e,i]of Object.entries(this._meshcoreDeviceMap))if(e.includes(s)&&e.includes(t)&&this._deviceEntities[i])return this._deviceEntities[i].filter(e=>!o.has(e.entity_id));const c=s.substring(0,6).toLowerCase();if(!c)return[];const d=[];for(const e of Object.values(this._deviceEntities))for(const t of e)t.entity_id.toLowerCase().includes(c)&&!o.has(t.entity_id)&&d.push(t);return d.sort((e,t)=>e.sortOrder-t.sortOrder)}async _loadNeighbors(e){if(this.hass){this._neighborData={...this._neighborData,[e.pubkey_prefix]:{neighbors:[],chartData:[],loading:!0,loaded:!1}};try{const t=await async function(e,t,i){try{const o={type:"meshcore_chat/get_neighbors",target_prefix:t};return i&&(o.entry_id=i),(await e.callWS(o)).neighbors||[]}catch{return[]}}(this.hass,e.pubkey_prefix,this.config?.node_prefix);let i=[];t.length>0&&(i=await this._fetchSNRHistory(t)),this._neighborData={...this._neighborData,[e.pubkey_prefix]:{neighbors:t,chartData:i,loading:!1,loaded:!0}}}catch(t){console.error(`Failed to load neighbors for ${e.name}:`,t),this._neighborData={...this._neighborData,[e.pubkey_prefix]:{neighbors:[],chartData:[],loading:!1,loaded:!0}}}}}async _fetchSNRHistory(e){if(!this.hass)return[];try{const t=e.filter(e=>e.entity_ids?.snr).map(e=>e.entity_ids.snr);if(0===t.length)return[];const i=await this.hass.callWS({type:"recorder/statistics_during_period",start_time:new Date(Date.now()-864e5).toISOString(),end_time:(new Date).toISOString(),statistic_ids:t,period:"hour"}),o={};return Object.entries(i).forEach(([t,i])=>{const r=e.find(e=>e.entity_ids?.snr===t);r&&Array.isArray(i)&&i.forEach(e=>{if(e.start&&null!=e.mean){const t=new Date(e.start).getTime();o[t]||(o[t]={}),o[t][r.pubkey_prefix]=e.mean}})}),Object.entries(o).map(([e,t])=>({timestamp:parseInt(e,10),values:t})).sort((e,t)=>e.timestamp-t.timestamp)}catch{return[]}}async _loadManagedDevices(){if(this.hass)try{this._loading=!0,this._error=null;const e=await async function(e,t){try{const i={type:"meshcore_chat/get_managed_devices"};t&&(i.entry_id=t);const o=await e.callWS(i);return{repeaters:o.repeaters||[],clients:o.clients||[]}}catch{return{repeaters:[],clients:[]}}}(this.hass,this.config?.node_prefix);this._managedDevices=e}catch(e){this._error=`Failed to load devices: ${String(e)}`}finally{this._loading=!1}}async _executeRemoteAction(e,t){if(this.hass)try{const i=await Me(this.hass,e.pubkey_prefix,t,this.config?.node_prefix);this._showStatusMessage(`${e.name}: ${t} → ${i.response||"OK"}`,"success")}catch(i){this._showStatusMessage(`${e.name}: ${t} failed — ${String(i)}`,"error")}}_fireMoreInfo(e){const t=new CustomEvent("hass-more-info",{detail:{entityId:e},bubbles:!0,composed:!0});this.dispatchEvent(t)}_confirmActionDialog(e,t,i){this._confirmAction={title:e,message:t,onConfirm:i},this._confirmDialogOpen=!0}async _onConfirmAction(){if(this._confirmDialogOpen=!1,this._confirmAction)try{await this._confirmAction.onConfirm()}catch(e){this._showStatusMessage(`Error: ${String(e)}`,"error")}this._confirmAction=null}_onConfirmCancel(){this._confirmDialogOpen=!1,this._confirmAction=null}_openCommandDialog(e,t){this._commandDialogTarget=e.pubkey_prefix,this._commandDialogIsLocal=t,this._commandDialogOpen=!0}_onCommandDialogClose(){this._commandDialogOpen=!1,this._commandDialogTarget="",this._commandDialogIsLocal=!1}_getManagedDeviceKey(e,t){return`${this.selectedDevice?.entry_id||""}_${t}_${e.pubkey_prefix}`}_loadHiddenSensors(){try{const e=localStorage.getItem("meshcore-hidden-sensors");e&&(this._hiddenSensors=JSON.parse(e))}catch{this._hiddenSensors={}}}_saveHiddenSensors(){try{localStorage.setItem("meshcore-hidden-sensors",JSON.stringify(this._hiddenSensors))}catch{}}_hideSensor(e,t){const i=this._hiddenSensors[e]||[];i.includes(t)||(this._hiddenSensors={...this._hiddenSensors,[e]:[...i,t]},this._saveHiddenSensors())}_unhideSensor(e,t){const i=this._hiddenSensors[e]||[];if(this._hiddenSensors={...this._hiddenSensors,[e]:i.filter(e=>e!==t)},0===this._hiddenSensors[e].length){const t={...this._hiddenSensors};delete t[e],this._hiddenSensors=t}this._saveHiddenSensors()}_unhideAllSensors(e){const t={...this._hiddenSensors};delete t[e],this._hiddenSensors=t,this._saveHiddenSensors()}_onTileContextMenu(e,t){const{entityId:i,label:o}=e.detail;this._contextMenu={entityId:i,label:o,deviceKey:t},this._overlayPointerStarted=!1}_onOverlayPointerDown(){this._overlayPointerStarted=!0}_dismissContextMenu(){this._overlayPointerStarted=!1,this._contextMenu=null}_closeContextMenu(){this._overlayPointerStarted&&this._dismissContextMenu()}_hideSensorFromContext(){this._contextMenu&&(this._hideSensor(this._contextMenu.deviceKey,this._contextMenu.entityId),this._showStatusMessage(`Hidden: ${this._contextMenu.label}`,"success"),this._contextMenu=null)}_onNeighborRightClick(e,t,i){e.preventDefault(),this._neighborContextMenu={name:t.name||t.pubkey_prefix,neighborPubkey:t.pubkey_prefix,repeaterPubkey:i},this._overlayPointerStarted=!1}_dismissNeighborContextMenu(){this._overlayPointerStarted=!1,this._neighborContextMenu=null}_closeNeighborContextMenu(){this._overlayPointerStarted&&this._dismissNeighborContextMenu()}_removeNeighborFromContext(){if(!this._neighborContextMenu)return;const{name:e,neighborPubkey:t,repeaterPubkey:i}=this._neighborContextMenu;this._neighborContextMenu=null,this._confirmActionDialog(`Remove neighbor ${e}?`,"This will remove the neighbor from the repeater and delete its sensors from HA. This cannot be undone.",()=>this._executeRemoveNeighbor(i,t,e))}_openNeighborMoreInfo(e,t,i){const o=e.substring(0,10).toLowerCase(),r=t.substring(0,6).toLowerCase(),s="snr"===i?`sensor.meshcore_${o}_neighbor_${r}`:`sensor.meshcore_${o}_neighbor_${r}_seen`;this.hass?.states[s]&&this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId:s},bubbles:!0,composed:!0}))}async _executeRemoveNeighbor(e,t,i){if(this.hass)try{const o=await this.hass.callWS({type:"meshcore_chat/remove_neighbor",entry_id:this.config?.node_prefix,target_prefix:e,neighbor_pubkey:t}),r=o?.entities_removed??0;this._showStatusMessage(`Removed ${i} (${r} sensors deleted)`,"success");const s=this._managedDevices.repeaters.find(t=>t.pubkey_prefix===e);s&&await this._loadNeighbors(s)}catch(e){this._showStatusMessage(`Failed to remove ${i}: ${e.message||e}`,"error")}}_getSettingsDeviceContext(){const e=this._settingsDeviceKey;if(!e)return null;const t=[...this._managedDevices.repeaters.map(e=>({device:e,type:"repeater"})),...this._managedDevices.clients.map(e=>({device:e,type:"client"}))];for(const{device:i,type:o}of t)if(this._getManagedDeviceKey(i,o)===e){let e=!1;return e=i.status_entity_id&&this.hass?.states[i.status_entity_id]?"on"===this.hass.states[i.status_entity_id].state:"online"===i.status,{device:i,type:o,name:i.name,isOnline:e}}return null}_closeSettingsModal(){this._settingsDeviceKey=null}_openHiddenSensorsList(){this._hiddenSensorsModalKey=this._settingsDeviceKey,this._settingsDeviceKey=null}_renderHiddenSensorsModal(){const e=this._hiddenSensorsModalKey,t=(this._hiddenSensors[e]||[]).map(e=>{let t=e;for(const i of Object.values(this._deviceEntities)){const o=i.find(t=>t.entity_id===e);if(o){t=o.label;break}}return{entityId:e,label:t}});return j`
      <div class="modal-overlay" @click=${this._closeHiddenSensorsModal}>
        <div class="modal-card" @click=${e=>e.stopPropagation()}>
          <div class="modal-header">
            <span class="modal-title">Hidden Sensors</span>
            <button class="modal-close" @click=${this._closeHiddenSensorsModal}>&times;</button>
          </div>
          <div class="modal-body">
            ${0===t.length?j`<div class="empty-hidden">No hidden sensors</div>`:t.map(t=>j`
                  <div class="hidden-sensor-item">
                    <div>
                      <div class="hidden-sensor-name">${t.label}</div>
                      <div class="hidden-sensor-id">${t.entityId}</div>
                    </div>
                    <button class="unhide-btn" @click=${()=>this._unhideSensor(e,t.entityId)}>Unhide</button>
                  </div>
                `)}
          </div>
          ${t.length>1?j`
                <div class="modal-footer">
                  <button class="action-btn" @click=${()=>{this._unhideAllSensors(e)}}>Unhide All</button>
                </div>
              `:W}
        </div>
      </div>
    `}_closeHiddenSensorsModal(){this._hiddenSensorsModalKey=null}_showStatusMessage(e,t){this._statusMessage={text:e,type:t},null!==this._statusMessageTimeout&&clearTimeout(this._statusMessageTimeout),this._statusMessageTimeout=window.setTimeout(()=>{this._statusMessage=null,this._statusMessageTimeout=null},5e3)}_formatRelativeTime(e){try{const t=Date.now()-new Date(e).getTime(),i=Math.floor(t/6e4);if(i<1)return"just now";if(i<60)return`${i}m ago`;const o=Math.floor(i/60);return o<24?`${o}h ago`:`${Math.floor(o/24)}d ago`}catch{return"unknown"}}};it.styles=[ve,a`
      :host {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .devices-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .content-area {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 16px;
        background: var(--primary-background-color, #fafafa);
      }

      .content-area::-webkit-scrollbar { width: 6px; }
      .content-area::-webkit-scrollbar-track { background: transparent; }
      .content-area::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
        border-radius: 3px;
      }

      /* Dashboard sections */
      .device-section {
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
      }

      .device-section:last-child {
        margin-bottom: 0;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }

      .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .section-icon.companion {
        background: rgba(3, 169, 244, 0.12);
        color: #0288d1;
      }

      .section-icon.repeater {
        background: rgba(255, 152, 0, 0.12);
        color: #f57c00;
      }

      .section-icon.client {
        background: rgba(76, 175, 80, 0.12);
        color: #388e3c;
      }

      .device-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .device-meta {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .device-meta span {
        margin-right: 12px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .status-badge.online {
        background: rgba(76, 175, 80, 0.12);
        color: #2e7d32;
      }

      .status-badge.offline {
        background: rgba(114, 114, 114, 0.12);
        color: #616161;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }

      .status-dot.online { background: #4caf50; }
      .status-dot.offline { background: #9e9e9e; }
      .status-dot.unknown { background: #ff9800; }

      .status-badge.unknown {
        background: rgba(255, 152, 0, 0.12);
        color: #e65100;
      }

      /* Sensor tiles grid */
      .subsection-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        margin-top: 16px;
      }

      .sensor-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }

      /* Neighbor section */
      .neighbor-section {
        margin-top: 16px;
      }

      .neighbor-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
        margin-top: 8px;
      }

      .neighbor-table th {
        text-align: left;
        padding: 6px 8px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        color: var(--secondary-text-color);
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .neighbor-table tbody tr {
        cursor: context-menu;
      }

      .neighbor-table tbody tr:hover {
        background: var(--table-row-alternative-background-color, rgba(255,255,255,0.05));
      }

      .neighbor-table td {
        padding: 6px 8px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        color: var(--primary-text-color);
      }

      .neighbor-table code {
        font-size: 12px;
        background: var(--secondary-background-color, #f5f5f5);
        padding: 1px 4px;
        border-radius: 3px;
      }

      .snr-good { color: #4caf50; font-weight: 600; }
      .snr-fair { color: #ff9800; font-weight: 600; }
      .snr-poor { color: #f44336; font-weight: 600; }

      .neighbor-table .clickable-value {
        cursor: pointer;
        border-radius: 4px;
        padding: 2px 4px;
        margin: -2px -4px;
        transition: background 0.15s;
      }

      .neighbor-table .clickable-value:hover {
        background: var(--secondary-background-color, rgba(0,0,0,0.05));
      }

      /* Action buttons */
      .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 16px;
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 6px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .action-btn:hover:not(:disabled) {
        background: var(--secondary-background-color, #f5f5f5);
        border-color: var(--primary-color, #03a9f4);
      }

      .action-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .action-btn.primary {
        background: var(--primary-color, #03a9f4);
        color: #fff;
        border-color: var(--primary-color, #03a9f4);
      }

      .action-btn.primary:hover:not(:disabled) {
        opacity: 0.9;
      }

      /* Loading / empty / error */
      .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--secondary-text-color);
        font-size: 14px;
        gap: 8px;
      }

      .loading-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid var(--divider-color, #e0e0e0);
        border-top-color: var(--primary-color, #03a9f4);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .neighbor-loading {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 12px 0;
        color: var(--secondary-text-color);
        font-size: 13px;
      }

      .neighbor-loading .loading-spinner {
        width: 14px;
        height: 14px;
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      .error-state {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        color: var(--error-color, #db4437);
        font-size: 13px;
        background: rgba(219, 68, 55, 0.08);
        border-radius: 8px;
        margin-bottom: 16px;
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 16px;
        color: var(--secondary-text-color);
        text-align: center;
      }

      .empty-text { font-size: 14px; }
      .empty-subtext { font-size: 12px; margin-top: 8px; opacity: 0.7; }

      /* Toast */
      .status-toast {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 13px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
      }

      .status-toast.success { border-left: 4px solid #4caf50; }
      .status-toast.error { border-left: 4px solid var(--error-color, #db4437); color: var(--error-color, #db4437); }

      @keyframes slideIn {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      /* Settings gear button */
      .settings-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 8px;
        flex-shrink: 0;
      }

      .settings-btn:hover {
        background: var(--secondary-background-color, #f0f0f0);
        color: var(--primary-text-color);
      }

      /* Modal overlay */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.15s ease-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .modal-card {
        background: var(--card-background-color, #fff);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        min-width: 260px;
        max-width: 400px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .modal-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .modal-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 18px;
      }

      .modal-close:hover {
        background: var(--secondary-background-color, #f0f0f0);
      }

      .modal-body {
        padding: 8px 0;
        overflow-y: auto;
      }

      .modal-action {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        cursor: pointer;
        transition: background 0.15s;
        color: var(--primary-text-color);
        font-size: 14px;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
      }

      .modal-action:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .modal-action.danger {
        color: var(--error-color, #db4437);
      }

      .modal-action-icon {
        display: flex;
        align-items: center;
        color: var(--secondary-text-color);
        flex-shrink: 0;
      }

      .modal-action.danger .modal-action-icon {
        color: var(--error-color, #db4437);
      }

      .modal-action:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .modal-action:disabled:hover {
        background: none;
      }

      .modal-divider {
        height: 1px;
        background: var(--divider-color, #e0e0e0);
        margin: 4px 0;
      }

      /* Hidden sensors list */
      .hidden-sensor-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 20px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .hidden-sensor-item:last-child {
        border-bottom: none;
      }

      .hidden-sensor-name {
        font-size: 13px;
        color: var(--primary-text-color);
      }

      .hidden-sensor-id {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .unhide-btn {
        padding: 4px 10px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 4px;
        background: var(--card-background-color, #fff);
        color: var(--primary-color, #03a9f4);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }

      .unhide-btn:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .modal-footer {
        padding: 12px 20px;
        border-top: 1px solid var(--divider-color, #e0e0e0);
        display: flex;
        justify-content: flex-end;
      }

      .empty-hidden {
        padding: 20px;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: 13px;
      }

      /* Chart container */
      .chart-container {
        margin-top: 8px;
        overflow-x: auto;
      }
    `],e([me({type:Object})],it.prototype,"hass",void 0),e([me({type:Object})],it.prototype,"config",void 0),e([me({type:Boolean})],it.prototype,"narrow",void 0),e([me({type:Object})],it.prototype,"selectedDevice",void 0),e([ue()],it.prototype,"_managedDevices",void 0),e([ue()],it.prototype,"_loading",void 0),e([ue()],it.prototype,"_error",void 0),e([ue()],it.prototype,"_confirmAction",void 0),e([ue()],it.prototype,"_confirmDialogOpen",void 0),e([ue()],it.prototype,"_commandDialogOpen",void 0),e([ue()],it.prototype,"_commandDialogTarget",void 0),e([ue()],it.prototype,"_commandDialogIsLocal",void 0),e([ue()],it.prototype,"_statusMessage",void 0),e([ue()],it.prototype,"_statusMessageTimeout",void 0),e([ue()],it.prototype,"_deviceEntities",void 0),e([ue()],it.prototype,"_meshcoreDeviceMap",void 0),e([ue()],it.prototype,"_entityRegistryLoaded",void 0),e([ue()],it.prototype,"_hiddenSensors",void 0),e([ue()],it.prototype,"_contextMenu",void 0),e([ue()],it.prototype,"_settingsDeviceKey",void 0),e([ue()],it.prototype,"_hiddenSensorsModalKey",void 0),e([ue()],it.prototype,"_neighborContextMenu",void 0),e([ue()],it.prototype,"_neighborData",void 0),it=e([pe("meshcore-devices-page")],it);let ot=class extends de{constructor(){super(...arguments),this.selected=!1}render(){if(!this.contact)return j``;const e=this.contact,t=this._getTypeClass(e.type),{label:i,cls:o}=this._getCategoryBadge(e);return j`
      <div class=${this.selected?"contact-card selected":"contact-card"}>
        <div class="contact-avatar ${t}">
          ${this._getTypeIcon(e.type)}
        </div>
        <div class="contact-info">
          <div class="contact-name">${e.adv_name}</div>
          <div class="contact-prefix">${e.pubkey_prefix}</div>
          <div class="contact-meta">
            ${e.lastmod?`Last heard ${new Date(1e3*e.lastmod).toLocaleString()}`:""}
          </div>
        </div>
        <span class="category-badge ${o}">${i}</span>
      </div>
    `}_getCategoryBadge(e){return e.added_to_node?{label:"Added",cls:"added"}:{label:"Discovered",cls:"discovered"}}_getTypeClass(e){switch(e){case 1:return"client";case 2:return"repeater";case 3:return"room-server";case 4:return"sensor";default:return"unknown"}}_getTypeIcon(e){switch(e){case 0:case 1:default:return j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`;case 2:return j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;case 3:return j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`;case 4:return j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`}}};ot.styles=a`
    :host {
      display: block;
    }

    .contact-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      background: var(--card-background-color, #fff);
    }

    .contact-card:hover {
      background: rgba(0, 0, 0, 0.02);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .contact-card.selected {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
      border-color: var(--primary-color, #03a9f4);
    }

    .contact-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .contact-avatar.client { background: #4caf50; }
    .contact-avatar.repeater { background: #ff9800; }
    .contact-avatar.room-server { background: #9c27b0; }
    .contact-avatar.sensor { background: #607d8b; }
    .contact-avatar.unknown { background: var(--primary-color, #03a9f4); }

    .contact-info {
      flex: 1;
      overflow: hidden;
    }

    .contact-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact-prefix {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-family: monospace;
    }

    .contact-meta {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      margin-top: 2px;
    }

    .category-badge {
      font-size: 10px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 10px;
      white-space: nowrap;
      flex-shrink: 0;
      align-self: center;
    }
    .category-badge.added {
      background: rgba(3, 169, 244, 0.15);
      color: #0277bd;
    }
    .category-badge.discovered {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
    }
  `,e([me({type:Object})],ot.prototype,"contact",void 0),e([me({type:Boolean})],ot.prototype,"selected",void 0),ot=e([pe("meshcore-contact-card")],ot);let rt=class extends de{constructor(){super(...arguments),this.selected=!1}render(){if(!this.node)return j``;const e="adv_name"in this.node,t=e?2===this.node.type:"repeater"===this.node.type,i=e&&3===this.node.type,o=e?1===this.node.type:"client"===this.node.type,r=e&&4===this.node.type,s=e?this.node.adv_name:this.node.name,a=this.node.pubkey_prefix,n=e?this.node.last_advert:void 0;let c=j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,d="Contact",l="";t?(c=j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,d="Repeater",l="repeater"):i?(c=j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`,d="Room Server",l="room-server"):r?(c=j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`,d="Sensor",l="sensor"):o&&(c=j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,d="Client",l="client");const p=e&&(0!==this.node.adv_lat||0!==this.node.adv_lon),h=n?new Date(1e3*n).toLocaleTimeString():"Unknown";return j`
      <div class=${this.selected?"node-card selected":"node-card"}>
        <div class="node-header">
          <div class=${`node-avatar ${l}`}>${c}</div>
          <div class="node-info">
            <div class="node-name">${s}</div>
            <div class="node-prefix">${a}</div>
            <div class=${`node-type-label ${l}`}>${d}</div>
          </div>
        </div>

        <div class="node-meta">
          ${n?j`<div class="meta-item"><span><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px;"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg></span><span>${h}</span></div>`:j``}
          ${p?j`<div class="location-indicator"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 2px;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>${this.node.adv_lat.toFixed(3)}, ${this.node.adv_lon.toFixed(3)}</div>`:j``}
          ${e&&this.node.out_path?j`<div class="route-info">Route: ${this.node.out_path.substring(0,12)}...</div>`:j``}
        </div>

        <div class="node-actions">
          ${e?j`
            <button class="action-btn" @click=${e=>{e.stopPropagation(),this._dispatch("node-message")}}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>Message</button>
          `:j``}
          ${t?j`
            <button class="action-btn" @click=${e=>{e.stopPropagation(),this._dispatch("node-telemetry")}}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>Telemetry</button>
          `:j``}
          <button class="action-btn danger" @click=${e=>{e.stopPropagation(),this._dispatch("node-delete")}}>Delete</button>
        </div>
      </div>
    `}_dispatch(e){this.dispatchEvent(new CustomEvent(e,{detail:{node:this.node},bubbles:!0,composed:!0}))}};rt.styles=a`
    :host { display: block; }

    .node-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      background: var(--card-background-color, #fff);
    }

    .node-card:hover {
      background: rgba(0, 0, 0, 0.02);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    .node-card.selected {
      background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.08);
      border-color: var(--primary-color, #03a9f4);
    }

    .node-header { display: flex; align-items: flex-start; gap: 12px; }

    .node-avatar {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--primary-color, #03a9f4); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 20px; flex-shrink: 0;
    }

    .node-avatar.repeater { background: #ff9800; }
    .node-avatar.room-server { background: #9c27b0; }
    .node-avatar.sensor { background: #607d8b; }
    .node-avatar.client { background: #4caf50; }

    .node-info { flex: 1; overflow: hidden; }

    .node-name {
      font-size: 14px; font-weight: 500; color: var(--primary-text-color);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .node-prefix {
      font-size: 12px; color: var(--secondary-text-color, #727272);
      font-family: monospace; margin-top: 2px;
    }

    .node-type-label {
      font-size: 11px; font-weight: 600; color: #fff;
      background: var(--primary-color, #03a9f4);
      padding: 2px 6px; border-radius: 4px;
      margin-top: 4px; display: inline-block;
    }

    .node-type-label.repeater { background: #ff9800; }
    .node-type-label.room-server { background: #9c27b0; }
    .node-type-label.sensor { background: #607d8b; }
    .node-type-label.client { background: #4caf50; }

    .node-meta {
      display: flex; gap: 12px; margin-top: 8px; padding-top: 8px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
      font-size: 11px; color: var(--secondary-text-color, #727272);
    }

    .meta-item { display: flex; align-items: center; gap: 4px; }

    .node-actions { display: flex; gap: 6px; }

    .action-btn {
      padding: 4px 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px; background: transparent;
      color: var(--primary-text-color);
      font-size: 11px; font-weight: 500;
      cursor: pointer; transition: all 0.15s;
    }

    .action-btn:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    .action-btn.danger {
      color: var(--error-color, #db4437);
      border-color: rgba(219, 68, 55, 0.3);
    }

    .action-btn.danger:hover {
      background: var(--error-color, #db4437);
      color: #fff;
      border-color: var(--error-color, #db4437);
    }

    .location-indicator {
      display: inline-flex; align-items: center; gap: 2px;
      padding: 2px 4px; background: rgba(0, 0, 0, 0.05);
      border-radius: 3px; font-size: 10px;
    }

    .route-info {
      font-size: 10px; color: var(--secondary-text-color, #727272);
      font-family: monospace;
    }
  `,e([me({type:Object})],rt.prototype,"node",void 0),e([me({type:Boolean})],rt.prototype,"selected",void 0),rt=e([pe("meshcore-node-card")],rt);let st=class extends de{constructor(){super(...arguments),this.open=!1,this.pendingAction=null,this._confirming=!1,this._confirmAction=null}render(){if(!this.open||!this.node)return j``;const e="adv_name"in this.node,t=e?2===this.node.type:"repeater"===this.node.type,i=e&&3===this.node.type,o=e?1===this.node.type:"client"===this.node.type,r=e&&4===this.node.type,s=e?this.node.adv_name:this.node.name,a=this.node.pubkey_prefix;let n=j`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,c="Contact",d="";return t?(n=j`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 5c-3.87 0-7 3.13-7 7h2c0-2.76 2.24-5 5-5s5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4C5.93 1 1 5.93 1 12h2c0-4.97 4.03-9 9-9s9 4.03 9 9h2c0-6.07-4.93-11-11-11zm0 8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`,c="Repeater",d="repeater"):i?(n=j`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>`,c="Room Server",d="room-server"):r?(n=j`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>`,c="Sensor",d="sensor"):o&&(n=j`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,c="Client",d="client"),j`
      <div class="dialog-backdrop" @click=${this._close}>
        <div class="dialog" @click=${e=>e.stopPropagation()}>
          <div class="dialog-header">
            <div class=${`dialog-avatar ${d}`}>${n}</div>
            <div class="dialog-title">
              <div class="dialog-name">${s}</div>
              <div class="dialog-type">${c}</div>
            </div>
            <button class="dialog-close" @click=${this._close}>✕</button>
          </div>

          <div class="dialog-content">
            ${this._confirming?j`
                  <div class="confirm-section">
                    <div class="confirm-text">
                      ${"remove-contact"===this._confirmAction?"Remove this as an Added Contact?":""}
                    </div>
                    ${"remove-contact"===this._confirmAction?j`
                      <div class="confirm-description">Removing the contact will make it a Discovered Contact.</div>
                    `:j``}
                    <div class="confirm-actions">
                      <button class="confirm-btn yes" @click=${()=>this._confirmAction_exec()}>Yes</button>
                      <button class="confirm-btn no" @click=${()=>{this._confirming=!1,this._confirmAction=null}}>Cancel</button>
                    </div>
                  </div>
                `:j`
                  <div class="section">
                    <div class="section-header">Quick Actions</div>
                    <div class="quick-actions ${e?"":"full"}">
                      ${e&&this.node.added_to_node&&(o||i)?j`
                        <button class="action-btn" @click=${()=>this._dispatchEvent("message")}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>Message</button>
                      `:j``}
                      ${a&&!o?j`
                        <button class="action-btn" @click=${()=>this._dispatchEvent("trace")}><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2 12a2 2 0 104 0 2 2 0 10-4 0zM10 12a2 2 0 104 0 2 2 0 10-4 0zM18 12a2 2 0 104 0 2 2 0 10-4 0zM7 10l3 2-3 2zM15 10l3 2-3 2z"/></svg>Trace</button>
                      `:j``}
                      ${e&&this.node.added_to_node?j`<button class="action-btn warning"
                            ?disabled=${"remove-contact"===this.pendingAction}
                            @click=${()=>{this._confirming=!0,this._confirmAction="remove-contact"}}>${"remove-contact"===this.pendingAction?"Removing…":"Remove Contact"}</button>`:e?j`<button class="action-btn"
                            ?disabled=${"add-contact"===this.pendingAction}
                            @click=${()=>this._dispatchEvent("add-contact")}>${"add-contact"===this.pendingAction?j`Adding…`:j`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>Add Contact`}</button>`:j``}
                    </div>
                  </div>

                  <div class="section">
                    <div class="section-header">Information</div>
                    <div class="info-grid">
                      <div class="info-item">
                        <div class="info-label">Public Key Prefix</div>
                        <div class="info-value">${a}</div>
                      </div>
                      <div class="info-item">
                        <div class="info-label">Type</div>
                        <div class="info-value">${c}</div>
                      </div>
                      ${e?j`
                        <div class="info-item">
                          <div class="info-label">Last Advert</div>
                          <div class="info-value">
                            ${this.node.last_advert?new Date(1e3*this.node.last_advert).toLocaleString():"Unknown"}
                          </div>
                        </div>
                        <div class="info-item">
                          <div class="info-label">Status</div>
                          <div class="info-value">${this.node.added_to_node?"Added Contact":"Discovered Contact"}</div>
                        </div>
                      `:j``}
                    </div>
                  </div>

                  ${!e||0===this.node.adv_lat&&0===this.node.adv_lon?j``:j`
                        <div class="section">
                          <div class="section-header">Location</div>
                          <div class="info-grid">
                            <div class="info-item">
                              <div class="info-label">Latitude</div>
                              <div class="info-value">${this.node.adv_lat.toFixed(6)}</div>
                            </div>
                            <div class="info-item">
                              <div class="info-label">Longitude</div>
                              <div class="info-value">${this.node.adv_lon.toFixed(6)}</div>
                            </div>
                          </div>
                        </div>
                      `}

                  ${e&&this.node.out_path?j`
                        <div class="section">
                          <div class="section-header">Network</div>
                          <div class="info-item">
                            <div class="info-label">Route (Outgoing Path)</div>
                            <div class="info-value">${this.node.out_path}</div>
                          </div>
                          ${this.node.out_path_len?j`
                                <div class="info-item" style="margin-top: 8px;">
                                  <div class="info-label">Path Length</div>
                                  <div class="info-value">${this.node.out_path_len} hops</div>
                                </div>
                              `:j``}
                        </div>
                      `:j``}

                `}
          </div>
        </div>
      </div>
    `}_close(){this.open=!1,this._confirming=!1,this._confirmAction=null,this.dispatchEvent(new CustomEvent("node-detail-closed",{bubbles:!0,composed:!0}))}_dispatchEvent(e){this.dispatchEvent(new CustomEvent(`node-${e}`,{detail:{node:this.node},bubbles:!0,composed:!0}))}_confirmAction_exec(){this._confirmAction&&this._dispatchEvent(this._confirmAction),this._close()}};st.styles=a`
    :host {
      display: contents;
    }

    .dialog-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .dialog {
      background: var(--card-background-color, #fff);
      border-radius: 8px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 5px 25px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.3s;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }

    .dialog-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--primary-color, #03a9f4);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 24px;
      flex-shrink: 0;
    }

    .dialog-avatar.repeater { background: #ff9800; }
    .dialog-avatar.room-server { background: #9c27b0; }
    .dialog-avatar.sensor { background: #607d8b; }
    .dialog-avatar.client { background: #4caf50; }

    .dialog-title { flex: 1; overflow: hidden; }

    .dialog-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dialog-type {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      margin-top: 2px;
    }

    .dialog-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .dialog-close:hover { color: var(--primary-text-color); }

    .dialog-content { padding: 16px; }

    .section { margin-bottom: 16px; }

    .section-header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--secondary-text-color, #727272);
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .quick-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }

    .quick-actions.full { grid-template-columns: 1fr; }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    .action-btn.warning {
      color: #ff9800;
      border-color: rgba(255, 152, 0, 0.4);
    }

    .action-btn.warning:hover {
      background: #ff9800;
      color: #fff;
      border-color: #ff9800;
    }

    .action-btn.danger {
      color: var(--error-color, #db4437);
      border-color: rgba(219, 68, 55, 0.3);
    }

    .action-btn.danger:hover {
      background: var(--error-color, #db4437);
      color: #fff;
      border-color: var(--error-color, #db4437);
    }

    .action-btn:disabled {
      opacity: 0.6;
      cursor: wait;
      pointer-events: none;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .info-item {
      padding: 8px;
      background: var(--primary-background-color, #fafafa);
      border-radius: 6px;
    }

    .info-label {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .info-value {
      font-size: 13px;
      color: var(--primary-text-color);
      margin-top: 4px;
      word-break: break-all;
      font-family: monospace;
    }

    .confirm-section {
      padding: 12px;
      background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2);
      border-radius: 6px;
      margin-bottom: 12px;
    }

    .confirm-text {
      font-size: 13px;
      color: var(--primary-text-color);
      margin-bottom: 8px;
    }

    .confirm-description {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      margin-bottom: 10px;
    }

    .confirm-actions { display: flex; gap: 6px; }

    .confirm-btn {
      padding: 6px 10px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .confirm-btn.yes { background: var(--error-color, #db4437); color: #fff; }
    .confirm-btn.no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

  `,e([me({type:Object})],st.prototype,"node",void 0),e([me({type:Boolean})],st.prototype,"open",void 0),e([me({type:Object})],st.prototype,"hass",void 0),e([me({type:String})],st.prototype,"pendingAction",void 0),e([ue()],st.prototype,"_confirming",void 0),e([ue()],st.prototype,"_confirmAction",void 0),st=e([pe("meshcore-node-detail-dialog")],st);const at={clients:1,repeaters:2,room_servers:3,sensors:4},nt={clients:"#4caf50",repeaters:"#ff9800",room_servers:"#9c27b0",sensors:"#607d8b"},ct={clients:"Clients",repeaters:"Repeaters",room_servers:"Room Servers",sensors:"Sensors"},dt={all:"",added:"#03a9f4",discovered:"#4caf50"};let lt=class extends de{constructor(){super(...arguments),this.contacts=[],this.channels=[],this.narrow=!1,this._viewportNarrow=!1,this._primaryFilter="all",this._typeFilter=null,this._searchQuery="",this._displayedContacts=[],this._totalCount=0,this._typeCounts={clients:0,repeaters:0,room_servers:0,sensors:0},this._l1Counts={all:0,added:0,discovered:0},this._loading=!1,this._nodeDetailDialogOpen=!1,this._pendingAction=null,this._sortBy="last_heard",this._onMediaChange=e=>{this._viewportNarrow=e.matches}}connectedCallback(){super.connectedCallback(),this._mediaQuery=window.matchMedia("(max-width: 870px)"),this._viewportNarrow=this._mediaQuery.matches,this._mediaQuery.addEventListener("change",this._onMediaChange),this._loadCounts(),this._loadPage(!0)}disconnectedCallback(){super.disconnectedCallback(),this._mediaQuery?.removeEventListener("change",this._onMediaChange),this._searchTimer&&(clearTimeout(this._searchTimer),this._searchTimer=void 0)}get _isNarrow(){return this.narrow||this._viewportNarrow}updated(e){super.updated(e),this._isNarrow?this.setAttribute("narrow",""):this.removeAttribute("narrow")}render(){return j`
      <div class="nodes-layout">
        <div class="nodes-header">
          <!-- Level 1 filters -->
          <div class="l1-filters">
            ${this._renderL1Button("all","All")}
            ${this._renderL1Button("added","★ Added")}
            ${this._renderL1Button("discovered","Discovered")}
          </div>

          <!-- Level 2 filters (hidden when L1 = All) -->
          ${"all"!==this._primaryFilter?j`
            <div class="l2-bar">
              ${this._renderL2Buttons()}
            </div>
          `:W}

          <!-- Search + actions row -->
          <div class="header-actions">
            <div class="search-bar" style="flex: 1;">
              <span class="search-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span>
              <input
                type="text"
                placeholder=${this._getSearchPlaceholder()}
                .value=${this._searchQuery}
                @input=${this._onSearchInput}>
              ${this._searchQuery?j`<button class="clear-search" @click=${()=>{this._searchQuery="",this._loadPage(!0)}}>✕</button>`:W}
            </div>
            <select class="sort-select"
              .value=${this._sortBy}
              @change=${e=>{this._sortBy=e.target.value,this._loadPage(!0)}}>
              <option value="last_heard">Last Heard</option>
              <option value="name">Name</option>
              <option value="prefix">Pub Prefix</option>
            </select>
            <button class="clear-btn"
              @click=${()=>this._clearStaleContacts()}
              title="Remove discovered contacts older than the configured threshold">
              Clear Stale
            </button>
            <button class="sync-btn"
              @click=${()=>this._syncAll()}>
              ⟳ Sync
            </button>
          </div>
        </div>

        <!-- Content area -->
        <div class="content-area">
          ${this._renderContactsContent()}
        </div>
      </div>

      <!-- Node detail dialog -->
      <meshcore-node-detail-dialog
        .hass=${this.hass}
        .node=${this._selectedNode}
        .pendingAction=${this._pendingAction}
        ?open=${this._nodeDetailDialogOpen}
        @node-detail-closed=${()=>{this._nodeDetailDialogOpen=!1}}
        @node-message=${()=>this._dispatchNodeAction("message")}
        @node-trace=${()=>this._dispatchNodeAction("trace")}
        @node-add-contact=${()=>this._dispatchNodeAction("add-contact")}
        @node-remove-contact=${()=>this._dispatchNodeAction("remove-contact")}>
      </meshcore-node-detail-dialog>

    `}_renderL1Button(e,t){const i=this._l1Counts[e],o=this._primaryFilter===e,r=dt[e];return j`
      <button
        class=${"l1-btn "+(o?"active":"")}
        style=${!o&&r?`border-left-color: ${r}`:""}
        @click=${()=>this._setPrimaryFilter(e)}>
        ${t} <span class="l1-count">(${i})</span>
      </button>
    `}_renderL2Buttons(){return["clients","repeaters","room_servers","sensors"].filter(e=>this._typeCounts[e]>0).map(e=>{const t=this._typeFilter===e,i=nt[e];return j`
          <button
            class=${"l2-btn "+(t?"active":"")}
            style=${t?`background: ${i}; border-color: ${i};`:`border-left: 2px solid ${i};`}
            @click=${()=>this._setTypeFilter(e)}>
            ${ct[e]} <span class="l2-count">(${this._typeCounts[e]})</span>
          </button>
        `})}_setPrimaryFilter(e){this._primaryFilter!==e&&(this._primaryFilter=e,this._typeFilter=null,this._displayedContacts=[],this._totalCount=0,this._loadPage(!0))}_setTypeFilter(e){this._typeFilter===e?this._typeFilter=null:this._typeFilter=e,this._displayedContacts=[],this._totalCount=0,this._loadPage(!0)}_onSearchInput(e){this._searchQuery=e.target.value,this._searchTimer&&clearTimeout(this._searchTimer),this._searchTimer=setTimeout(()=>this._loadPage(!0),300)}_getSearchPlaceholder(){const e=this._primaryFilter,t=this._typeFilter?ct[this._typeFilter].toLowerCase():"nodes";return"all"===e?"Search all nodes...":`Search ${e} ${t}...`}async _loadPage(e=!1){if(this.hass){this._loading=!0;try{const t=e?0:this._displayedContacts.length,i=this._typeFilter?at[this._typeFilter]:void 0,o=this._searchQuery.trim()||void 0,r=await async function(e,t="all",i={}){try{const o={type:"meshcore_chat/get_contacts_paginated",category:t,limit:i.limit??50,offset:i.offset??0};return void 0!==i.nodeType&&(o.node_type=i.nodeType),i.search&&(o.search=i.search),i.entryId&&(o.entry_id=i.entryId),i.sortBy&&(o.sort_by=i.sortBy),await e.callWS(o)}catch{return{contacts:[],total:0,counts:{clients:0,repeaters:0,room_servers:0,sensors:0}}}}(this.hass,this._primaryFilter,{nodeType:i,search:o,limit:50,offset:t,entryId:this.config?.entry_id,sortBy:this._sortBy});this._displayedContacts=e?r.contacts:[...this._displayedContacts,...r.contacts],this._totalCount=r.total,this._typeCounts=r.counts}catch(e){console.error("Failed to load contacts:",e)}finally{this._loading=!1}}}async _loadCounts(){if(this.hass)try{this._l1Counts=await async function(e,t){try{const i={type:"meshcore_chat/get_node_counts"};return t&&(i.entry_id=t),await e.callWS(i)}catch{return{all:0,added:0,discovered:0}}}(this.hass,this.config?.entry_id)}catch(e){console.error("Failed to load node counts:",e)}}async _clearStaleContacts(){if(!this.hass)return;const e=prompt("Remove discovered contacts older than how many days?","30");if(!e)return;const t=parseInt(e,10);isNaN(t)||t<1||t>365||(await async function(e,t,i){try{const o={type:"meshcore_chat/clear_discovered_contacts"};return void 0!==t&&(o.days_threshold=t),i&&(o.entry_id=i),await e.callWS(o)}catch{return{removed:0}}}(this.hass,t,this.config?.entry_id)).removed>0&&(this._loadPage(!0),this._loadCounts(),this.dispatchEvent(new CustomEvent("contacts-changed",{bubbles:!0,composed:!0})))}_syncAll(){this._loadPage(!0),this._loadCounts(),this.dispatchEvent(new CustomEvent("contacts-changed",{bubbles:!0,composed:!0}))}_renderContactsContent(){return this._loading&&0===this._displayedContacts.length?j`
        <div class="empty-state">
          <div class="empty-text">Loading...</div>
        </div>
      `:0===this._displayedContacts.length?this._renderEmptyState():j`
      <div class="nodes-grid">
        ${this._displayedContacts.map(e=>j`
          <div @click=${()=>this._openNodeDetail(e)}>
            <meshcore-contact-card .contact=${e}></meshcore-contact-card>
          </div>
        `)}
      </div>
      ${this._displayedContacts.length<this._totalCount?j`
        <div class="load-more">
          <button ?disabled=${this._loading} @click=${()=>this._loadPage()}>
            ${this._loading?"Loading...":`Load More (${this._displayedContacts.length} of ${this._totalCount})`}
          </button>
        </div>
      `:W}
    `}_renderEmptyState(){const e=this._primaryFilter,t=this._typeFilter;let i=j`<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,o="No nodes found",r="";return this._searchQuery?(o="No matching nodes",r=`No results for "${this._searchQuery}"`):"added"===e?(o="No added contacts",r=t?`No added ${ct[t].toLowerCase()}`:"Add discovered contacts to see them here"):"discovered"===e?(o="No discovered nodes",r=t?`No discovered ${ct[t].toLowerCase()}`:"Nodes seen on the mesh will appear here"):"all"===e&&(o="No nodes",r="No contacts or discovered nodes yet"),j`
      <div class="empty-state">
        <div class="empty-icon">${i}</div>
        <div class="empty-text">${o}</div>
        ${r?j`<div class="empty-subtext">${r}</div>`:W}
      </div>
    `}_openNodeDetail(e){this._selectedNode=e,this._nodeDetailDialogOpen=!0}_dispatchNodeAction(e){"add-contact"!==e&&"remove-contact"!==e||(this._pendingAction=e),this.dispatchEvent(new CustomEvent("node-action",{detail:{action:e,node:this._selectedNode},bubbles:!0,composed:!0})),"message"!==e&&"delete"!==e||(this._nodeDetailDialogOpen=!1)}clearPendingAction(){this._pendingAction=null}async refreshAfterMutation(e){if(await Promise.all([this._loadPage(!0),this._loadCounts()]),this._nodeDetailDialogOpen&&this._selectedNode&&e){const t=this._displayedContacts.find(t=>!(!t.public_key||t.public_key!==e)||!(!t.pubkey_prefix||!e.startsWith(t.pubkey_prefix)));t?this._selectedNode={...t}:this._nodeDetailDialogOpen=!1}}};lt.styles=a`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .nodes-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .nodes-header {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--card-background-color, #fff);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      flex-shrink: 0;
    }

    /* ─── Level 1 filter buttons ────────────────────────────────────── */

    .l1-filters {
      display: flex;
      gap: 6px;
    }

    .l1-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 8px 14px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 20px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border-left: 3px solid transparent;
    }

    .l1-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    .l1-btn.active {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
      border-left-color: var(--primary-color, #03a9f4);
    }

    .l1-count {
      font-size: 11px;
      opacity: 0.8;
    }

    /* ─── Level 2 filter buttons ────────────────────────────────────── */

    .l2-bar {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .l2-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 10px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 14px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .l2-btn:hover {
      background: rgba(0, 0, 0, 0.03);
      color: var(--primary-text-color);
    }

    .l2-btn.active {
      color: #fff;
      border-color: transparent;
    }

    .l2-count {
      font-size: 10px;
      opacity: 0.8;
    }

    .l2-spacer {
      flex: 1;
    }

    /* ─── Search bar ────────────────────────────────────────────────── */

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--primary-background-color, #fafafa);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      padding: 6px 10px;
    }

    .search-icon {
      flex-shrink: 0;
      color: var(--secondary-text-color, #727272);
      display: flex;
    }

    .search-bar input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 13px;
      color: var(--primary-text-color);
      outline: none;
    }

    .clear-search {
      border: none;
      background: none;
      cursor: pointer;
      color: var(--secondary-text-color, #727272);
      font-size: 16px;
      padding: 0 2px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .sync-btn {
      padding: 6px 12px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px;
      background: transparent;
      color: var(--secondary-text-color, #727272);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .sync-btn:hover {
      background: var(--primary-color, #03a9f4);
      color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    .sort-select {
      padding: 4px 8px; border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px; background: var(--card-background-color, #fff);
      color: var(--primary-text-color); font-size: 11px; cursor: pointer;
      box-sizing: border-box;
      height: 28px;
      min-height: 28px;
      line-height: normal;
      appearance: menulist;
      -webkit-appearance: menulist;
    }

    /* ─── Content area ──────────────────────────────────────────────── */

    .content-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px;
      background: var(--primary-background-color, #fafafa);
    }

    .content-area::-webkit-scrollbar { width: 6px; }
    .content-area::-webkit-scrollbar-track { background: transparent; }
    .content-area::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
      border-radius: 3px;
    }

    .nodes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 8px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--secondary-text-color, #727272);
      text-align: center;
    }
    .empty-icon { font-size: 48px; margin-bottom: 16px; opacity: 0.5; }
    .empty-text { font-size: 16px; margin-bottom: 8px; }
    .empty-subtext { font-size: 13px; opacity: 0.7; max-width: 300px; }

    .clear-btn {
      padding: 4px 10px; border: 1px solid rgba(219, 68, 55, 0.3);
      border-radius: 4px; background: transparent;
      color: var(--error-color, #db4437); font-size: 11px;
      font-weight: 500; cursor: pointer; transition: all 0.15s;
    }
    .clear-btn:hover {
      background: var(--error-color, #db4437); color: #fff;
      border-color: var(--error-color, #db4437);
    }

    .confirm-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2); border-radius: 6px;
      margin-bottom: 12px; font-size: 12px;
    }
    .confirm-bar button {
      padding: 4px 10px; border: none; border-radius: 4px;
      font-size: 11px; font-weight: 600; cursor: pointer;
    }
    .confirm-bar .yes { background: var(--error-color, #db4437); color: #fff; }
    .confirm-bar .no { background: var(--divider-color, #e0e0e0); color: var(--primary-text-color); }

    .category-badge {
      font-size: 10px; font-weight: 500; padding: 2px 8px;
      border-radius: 10px; white-space: nowrap; flex-shrink: 0; align-self: center;
    }

    .load-more {
      display: flex; justify-content: center; padding: 12px;
    }
    .load-more button {
      padding: 8px 20px; border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 6px; background: transparent;
      color: var(--primary-text-color); font-size: 12px;
      cursor: pointer; transition: all 0.15s;
    }
    .load-more button:hover {
      background: var(--primary-color, #03a9f4); color: #fff;
      border-color: var(--primary-color, #03a9f4);
    }

    /* ─── Narrow overrides ──────────────────────────────────────────── */

    :host([narrow]) .l1-filters { gap: 4px; flex-wrap: wrap; }
    :host([narrow]) .l1-btn { font-size: 11px; padding: 5px 10px; }
    :host([narrow]) .l2-btn { font-size: 11px; padding: 5px 10px; }
    :host([narrow]) .nodes-grid { grid-template-columns: 1fr; }
  `,e([me({type:Array})],lt.prototype,"contacts",void 0),e([me({type:Array})],lt.prototype,"channels",void 0),e([me({type:Boolean})],lt.prototype,"narrow",void 0),e([me({type:Object})],lt.prototype,"hass",void 0),e([me({type:Object})],lt.prototype,"config",void 0),e([ue()],lt.prototype,"_viewportNarrow",void 0),e([ue()],lt.prototype,"_primaryFilter",void 0),e([ue()],lt.prototype,"_typeFilter",void 0),e([ue()],lt.prototype,"_searchQuery",void 0),e([ue()],lt.prototype,"_displayedContacts",void 0),e([ue()],lt.prototype,"_totalCount",void 0),e([ue()],lt.prototype,"_typeCounts",void 0),e([ue()],lt.prototype,"_l1Counts",void 0),e([ue()],lt.prototype,"_loading",void 0),e([ue()],lt.prototype,"_selectedNode",void 0),e([ue()],lt.prototype,"_nodeDetailDialogOpen",void 0),e([ue()],lt.prototype,"_pendingAction",void 0),e([ue()],lt.prototype,"_sortBy",void 0),lt=e([pe("meshcore-nodes-page")],lt);let pt=class extends de{constructor(){super(...arguments),this.narrow=!1,this._deviceConfig=null,this._loading=!0,this._error=null,this._editValues={},this._saving=!1,this._commandDialogOpen=!1,this._confirmAction=null,this._confirmDialogOpen=!1,this._locationSource="manual",this._importKeyValue="",this._deviceEntities={},this._meshcoreDeviceMap={},this._entityRegistryLoaded=!1,this._hiddenSensors={},this._contextMenu=null,this._overlayPointerStarted=!1,this._settingsModalOpen=!1,this._keyManagementModalOpen=!1,this._hiddenSensorsModalKey=null,this._statusMessage=null,this._statusMessageTimeout=null,this._onCompanionTrace=()=>{const e=this.selectedDevice?.entry_id;this.dispatchEvent(new CustomEvent("companion-trace-requested",{detail:{entryId:e},bubbles:!0,composed:!0}))}}connectedCallback(){super.connectedCallback(),this._loadDeviceConfig(),this._loadHiddenSensors()}disconnectedCallback(){super.disconnectedCallback(),null!==this._statusMessageTimeout&&(clearTimeout(this._statusMessageTimeout),this._statusMessageTimeout=null)}updated(e){e.has("config")&&this._loadDeviceConfig(),e.has("hass")&&this.hass&&!this._entityRegistryLoaded&&this._loadEntityRegistry()}async _loadDeviceConfig(){if(this.hass){this._loading=!0,this._error=null;try{this._deviceConfig=await ke(this.hass,this.config?.node_prefix),this._deviceConfig?.location_source&&(this._locationSource=this._deviceConfig.location_source)}catch(e){this._error=`Failed to load device configuration: ${String(e)}`}finally{this._loading=!1}}}render(){return this._loading?j`
        <div class="settings-page">
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--secondary-text-color);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="loading-spinner"></div>
              <span>Loading settings...</span>
            </div>
          </div>
        </div>
      `:this._error?j`
        <div class="settings-page">
          <div style="padding: 16px; color: var(--error-color); font-size: 14px;">
            ${this._error}
          </div>
        </div>
      `:this._deviceConfig?j`
      <div class="settings-page">
        <div class="settings-container">
          <!-- Companion Device Card (full width at top) -->
          ${this.selectedDevice?this._renderCompanionCard():W}

          <!-- Two-column grid for settings cards -->
          <div class="settings-grid">
            <!-- Companion Information -->
            <div class="device-section">
              <div class="card-title">General</div>
              ${this._renderDeviceInfo()}
            </div>

            <!-- Radio & RF Settings -->
            <div class="device-section">
              <div class="card-title">Radio</div>
              ${this._renderRadioSettings()}
            </div>

            <!-- Location -->
            <div class="device-section">
              <div class="card-title">Location</div>
              ${this._renderLocation()}
            </div>



          </div>

        </div>
      </div>

      <!-- Modals & Dialogs -->
      ${this._contextMenu?j`
        <div class="modal-overlay"
             @pointerdown=${this._onOverlayPointerDown}
             @click=${this._closeContextMenu}>
          <div class="modal-card" @click=${e=>e.stopPropagation()}
               @pointerdown=${e=>e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">${this._contextMenu.label}</span>
              <button class="modal-close" @click=${this._closeContextMenu}
                      @pointerdown=${e=>e.stopPropagation()}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action danger" @click=${this._hideSensorFromContext}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                Hide Sensor
              </button>
            </div>
          </div>
        </div>
      `:W}

      <!-- Settings Modal -->
      ${this._settingsModalOpen?j`
        <div class="modal-overlay" @click=${this._closeSettingsModal}>
          <div class="modal-card" @click=${e=>e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">Companion Settings</span>
              <button class="modal-close" @click=${this._closeSettingsModal}>&times;</button>
            </div>
            <div class="modal-body">
              <button class="modal-action" @click=${this._openHiddenSensorsList}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg></span>
                View Hidden Sensors (${(this._hiddenSensors[this._getCompanionDeviceKey()]||[]).length})
              </button>

              <button class="modal-action" @click=${this._openCommandDialogForCompanion}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 19V7H4v12h16m0-16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h16m-7 14v-2h5v2h-5m-3.42-4L5.57 9H8.4l3.3 3.3c.39.39.39 1.03 0 1.42L8.42 17H5.59l4-4z"/></svg></span>
                Issue Command
              </button>

              <div class="modal-divider"></div>

              <button class="modal-action danger" @click=${this._handleRebootFromModal}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></span>
                Reboot Device
              </button>

              <button class="modal-action danger" @click=${this._openKeyManagementModal}>
                <span class="modal-action-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.65 10a6 6 0 110 4H10v2H8v-2H6v-2h6.65zM17 14a2 2 0 100-4 2 2 0 000 4z"/></svg></span>
                Key Management
              </button>
            </div>
          </div>
        </div>
      `:W}

      <!-- Key Management Modal -->
      ${this._keyManagementModalOpen?j`
        <div class="modal-overlay" @click=${this._closeKeyManagementModal}>
          <div class="modal-card" style="max-width: 440px;" @click=${e=>e.stopPropagation()}>
            <div class="modal-header">
              <span class="modal-title">Key Management</span>
              <button class="modal-close" @click=${this._closeKeyManagementModal}>&times;</button>
            </div>
            <div class="modal-body" style="padding: 16px 20px;">
              ${this._renderIdentityManagement()}
            </div>
          </div>
        </div>
      `:W}

      <!-- Hidden Sensors Modal -->
      ${this._hiddenSensorsModalKey?this._renderHiddenSensorsModal():W}

      <!-- Status Toast -->
      ${this._statusMessage?j`
        <div class="status-toast ${this._statusMessage.type}">
          ${this._statusMessage.text}
        </div>
      `:W}

      <!-- Dialogs -->
      <meshcore-confirm-dialog
        .open=${this._confirmDialogOpen}
        .title=${this._confirmAction?.title||""}
        .message=${this._confirmAction?.message||""}
        .requireTyped=${this._confirmAction?.requireTyped}
        ?dangerous=${!!this._confirmAction?.requireTyped}
        @confirm=${this._onConfirmAction}
        @cancel=${this._onConfirmCancel}>
      </meshcore-confirm-dialog>

      <meshcore-command-dialog
        .open=${this._commandDialogOpen}
        .hass=${this.hass}
        .entryId=${this.config?.node_prefix}
        ?isLocal=${!0}
        ?narrow=${this.narrow}
        @close=${this._onCommandDialogClose}>
      </meshcore-command-dialog>
    `:j`<div>No device config loaded</div>`}_renderCompanionCard(){if(!this.selectedDevice)return W;const e=this.selectedDevice,t=e.connected,i=this._getCompanionDeviceKey(),o=this._getCompanionEntities(),r=(this._hiddenSensors[i]||[]).length;return j`
      <div class="device-section" @tile-context-menu=${e=>this._onTileContextMenu(e,i)}>
        <div class="companion-header">
          <div class="section-title">
            <div class="section-icon companion">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6.05 4.14l-.39-.39c-.39-.39-1.02-.39-1.41 0l-.01.01c-.39.39-.39 1.02 0 1.41l.39.39c.39.39 1.03.39 1.42 0 .39-.39.39-1.03 0-1.42zm12.3-.01c-.39-.39-1.02-.39-1.41 0l-.38.38c-.39.39-.39 1.03 0 1.42.39.39 1.02.39 1.41 0l.38-.38c.4-.4.4-1.03.01-1.42zM12 4c.55 0 1-.45 1-1V1c0-.55-.45-1-1-1s-1 .45-1 1v2c0 .55.45 1 1 1zm-1 11h2v2h-2v-2zm7-5c0 3.87-3.13 7-7 7s-7-3.13-7-7 3.13-7 7-7 7 3.13 7 7z"/></svg>
            </div>
            <div>
              <div class="device-name">${e.name}</div>
              <div class="device-meta">
                <span>Companion</span>
                <span>Firmware: ${e.firmware||"unknown"}</span>
                <span>Key: ${e.pubkey_prefix}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <button class="settings-btn" @click=${()=>this._settingsModalOpen=!0} title="Device settings">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
            <div class="status-badge ${t?"online":"offline"}">
              <span class="status-dot ${t?"online":"offline"}"></span>
              ${t?"Connected":"Offline"}
            </div>
          </div>
        </div>

        ${o.length>0?j`
              <div class="subsection-label">Sensors${r>0?j` <span style="opacity:0.6">(${r} hidden)</span>`:W}</div>
              <div class="sensor-grid">
                ${o.map(e=>j`
                  <meshcore-sensor-tile
                    .hass=${this.hass}
                    .entityId=${e.entity_id}
                    .label=${e.label}
                    .icon=${e.icon}
                    .colorScheme=${e.colorScheme}>
                  </meshcore-sensor-tile>
                `)}
              </div>
            `:W}

        <div class="actions-row">
          <button class="action-btn" ?disabled=${!t} @click=${()=>this._executeCompanionAction("send_advert",void 0,"Local Advert")}>Local Advert</button>
          <button class="action-btn" ?disabled=${!t} @click=${()=>this._executeCompanionAction("send_advert",{flood:!0},"Flood Advert")}>Flood Advert</button>
          <button class="action-btn" ?disabled=${!t} @click=${()=>this._executeCompanionAction("get_bat",void 0,"Get Battery")}>Get Battery</button>
          <button class="action-btn" ?disabled=${!t} @click=${()=>this._executeCompanionAction("set_time",{val:Math.floor(Date.now()/1e3)},"Sync Clock")}>Sync Clock</button>
          <button class="action-btn" ?disabled=${!t} @click=${this._onCompanionTrace}>Trace</button>
        </div>
      </div>
    `}_renderHiddenSensorsModal(){const e=this._hiddenSensorsModalKey,t=(this._hiddenSensors[e]||[]).map(e=>{let t=e;for(const i of Object.values(this._deviceEntities)){const o=i.find(t=>t.entity_id===e);if(o){t=o.label;break}}return{entityId:e,label:t}});return j`
      <div class="modal-overlay" @click=${this._closeHiddenSensorsModal}>
        <div class="modal-card" @click=${e=>e.stopPropagation()}>
          <div class="modal-header">
            <span class="modal-title">Hidden Sensors</span>
            <button class="modal-close" @click=${this._closeHiddenSensorsModal}>&times;</button>
          </div>
          <div class="modal-body">
            ${0===t.length?j`<div class="empty-hidden">No hidden sensors</div>`:t.map(t=>j`
                  <div class="hidden-sensor-item">
                    <div>
                      <div class="hidden-sensor-name">${t.label}</div>
                      <div class="hidden-sensor-id">${t.entityId}</div>
                    </div>
                    <button class="unhide-btn" @click=${()=>this._unhideSensor(e,t.entityId)}>Unhide</button>
                  </div>
                `)}
          </div>
          ${t.length>1?j`
                <div class="modal-footer">
                  <button class="action-btn" @click=${()=>{this._unhideAllSensors(e)}}>Unhide All</button>
                </div>
              `:W}
        </div>
      </div>
    `}_renderDeviceInfo(){if(this._deviceConfig)return j`
      <div class="info-row">
        <span class="info-label">Hardware Model</span>
        <span class="info-value">${this._deviceConfig.hardware_model}</span>
      </div>

      <div class="info-row">
        <span class="info-label">Public Key</span>
        <span class="info-value" style="display: flex; align-items: center; gap: 6px;">
          ${this._deviceConfig.pubkey}
          <button
            style="border: none; background: none; cursor: pointer; padding: 2px; color: var(--secondary-text-color); display: flex; align-items: center;"
            title="Copy public key"
            @click=${()=>this._copyToClipboard(this._deviceConfig.pubkey)}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
          </button>
        </span>
      </div>

      ${this._deviceConfig.connection_type?j`
        <div class="info-row">
          <span class="info-label">Connection</span>
          <span class="info-value">${this._deviceConfig.connection_type.toUpperCase()}${this._deviceConfig.connection_address?j` — ${this._deviceConfig.connection_address}`:""}</span>
        </div>
      `:""}

      <div class="danger-zone" style="margin-top: 16px;">
        <div class="danger-zone-title">Rename Device</div>
        <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">
          Changing the device name will change all entity IDs. Automations, scripts, and dashboards using current entity IDs will need to be updated.
        </div>
        <div style="display: flex; gap: 8px;">
          <input
            type="text"
            class="form-input"
            style="flex: 1;"
            .value=${this._editValues.name??this._deviceConfig.name}
            @input=${e=>{this._editValues.name=e.target.value}}
          />
          <button class="danger-button"
            ?disabled=${!this._editValues.name||this._editValues.name===this._deviceConfig.name}
            @click=${this._handleNameSave}>
            Rename
          </button>
        </div>
      </div>
    `}_renderRadioSettings(){if(!this._deviceConfig)return;const e=this._hasChanges("radio-settings",["tx_power","frequency","bandwidth","spreading_factor","coding_rate","path_hash_mode"]);return j`
      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">TX Power (dBm)</label>
          <input
            type="number"
            class="form-input"
            min="2"
            max="22"
            .value=${String(this._editValues.tx_power??this._deviceConfig.tx_power??17)}
            @input=${e=>{this._editValues.tx_power=Number(e.target.value)}}
          />
        </div>
        <div class="form-group-inline">
          <label class="form-label">Frequency (MHz)</label>
          <input
            type="number"
            class="form-input"
            step="0.001"
            .value=${String(this._editValues.frequency??this._deviceConfig.frequency??906.875)}
            @input=${e=>{this._editValues.frequency=Number(e.target.value)}}
          />
        </div>
      </div>

      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Bandwidth (kHz)</label>
          <select
            class="form-select"
            @change=${e=>{this._editValues.bandwidth=Number(e.target.value)}}>
            ${[7.8,10.4,15.6,20.8,31.25,41.7,62.5,125,250,500].map(e=>{const t=this._editValues.bandwidth??this._deviceConfig.bandwidth??250;return j`<option value=${e} ?selected=${Number(t)===e}>${e}</option>`})}
          </select>
        </div>
        <div class="form-group-inline">
          <label class="form-label">Spreading Factor</label>
          <select
            class="form-select"
            @change=${e=>{this._editValues.spreading_factor=Number(e.target.value)}}>
            ${[7,8,9,10,11,12].map(e=>{const t=this._editValues.spreading_factor??this._deviceConfig.spreading_factor??11;return j`<option value=${e} ?selected=${Number(t)===e}>${e}</option>`})}
          </select>
        </div>
      </div>

      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Coding Rate</label>
          <select
            class="form-select"
            @change=${e=>{this._editValues.coding_rate=Number(e.target.value)}}>
            ${[5,6,7,8].map(e=>{const t=this._editValues.coding_rate??this._deviceConfig.coding_rate??5;return j`<option value=${e} ?selected=${Number(t)===e}>${e}</option>`})}
          </select>
        </div>
        <div class="form-group-inline">
          <label class="form-label">Path Hash Mode</label>
          <select
            class="form-select"
            @change=${e=>{this._editValues.path_hash_mode=Number(e.target.value)}}>
            ${[[0,"0 - 1 byte"],[1,"1 - 2 byte"],[2,"2 - 3 byte"]].map(([e,t])=>{const i=this._editValues.path_hash_mode??this._deviceConfig.path_hash_mode??0;return j`<option value=${e} ?selected=${Number(i)===e}>${t}</option>`})}
          </select>
        </div>
      </div>

      <button
        class="apply-button"
        style="width: 100%; margin-top: 12px;"
        ?disabled=${!e||this._saving}
        @click=${()=>this._handleApply("radio-settings")}>
        ${this._saving?"Applying...":"Apply Radio Settings"}
      </button>

      <div style="margin-top: 12px; padding: 8px; background: rgba(0, 0, 0, 0.02); border-radius: 6px; font-size: 12px; color: var(--secondary-text-color);">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: -2px; margin-right: 4px;"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>Radio changes require device reboot to take effect
      </div>
    `}_renderLocation(){if(!this._deviceConfig)return;const e="ha_location"===this._locationSource,t=e?this.hass?.states["zone.home"]:null,i=this._locationSource!==(this._deviceConfig.location_source??"manual"),o=this._hasChanges("location",["latitude","longitude"]),r=i||o,s=String(e&&t?t.attributes.latitude??0:this._editValues.latitude??this._deviceConfig.latitude??0),a=String(e&&t?t.attributes.longitude??0:this._editValues.longitude??this._deviceConfig.longitude??0);return j`
      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Latitude</label>
          <input
            type="number"
            class="form-input"
            step="0.000001"
            min="-90"
            max="90"
            .value=${s}
            ?disabled=${e}
            @input=${e=>{this._editValues.latitude=Number(e.target.value)}}
          />
        </div>
        <div class="form-group-inline">
          <label class="form-label">Longitude</label>
          <input
            type="number"
            class="form-input"
            step="0.000001"
            min="-180"
            max="180"
            .value=${a}
            ?disabled=${e}
            @input=${e=>{this._editValues.longitude=Number(e.target.value)}}
          />
        </div>
      </div>
      ${e?j`
        <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: -8px; margin-bottom: 8px;">
          Using coordinates from Home Assistant zone.home
        </div>
      `:""}

      <div class="section-row">
        <div class="form-group-inline">
          <label class="form-label">Location Source</label>
          <select
            class="form-select"
            .value=${this._locationSource}
            @change=${e=>{this._locationSource=e.target.value}}>
            <option value="manual">Manual (coordinates above)</option>
            <option value="gps">GPS (device hardware)</option>
            <option value="ha_location">Home Assistant Zone</option>
          </select>
          <div style="font-size: 11px; color: var(--secondary-text-color); margin-top: 4px;">
            How the device determines its coordinates
          </div>
        </div>
      </div>

      <button
        class="apply-button"
        style="width: 100%; margin-top: 12px;"
        ?disabled=${!r||this._saving}
        @click=${this._applyLocation}>
        ${this._saving?"Applying...":"Apply Location Settings"}
      </button>
    `}_renderIdentityManagement(){return j`
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <div class="danger-zone" style="margin-top: 0;">
          <div class="danger-zone-title">Regenerate Identity</div>
          <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">
            Creates a new key pair. All contacts will need to re-add you. This will change all entity IDs — automations, scripts, and dashboards using current entity IDs will need to be updated.
          </div>
          <button class="danger-button" @click=${this._showRegenIdentityConfirm}>
            Regenerate Identity
          </button>
        </div>
        <div class="danger-zone" style="margin-top: 0;">
          <div class="danger-zone-title">Import Private Key</div>
          <div style="font-size: 12px; color: var(--secondary-text-color); margin-bottom: 8px;">
            Importing a key changes the device identity. This will change all entity IDs — automations, scripts, and dashboards using current entity IDs will need to be updated.
          </div>
          <div style="display: flex; gap: 8px;">
            <input
              type="text"
              class="form-input"
              style="flex: 1; font-family: monospace;"
              placeholder="Hex private key"
              .value=${this._importKeyValue}
              @input=${e=>{this._importKeyValue=e.target.value}}
            />
            <button
              class="danger-button"
              ?disabled=${!this._importKeyValue.trim()}
              @click=${this._handleImportKeyConfirm}>
              Import
            </button>
          </div>
        </div>
      </div>
    `}_hasChanges(e,t){return!!this._deviceConfig&&t.some(e=>void 0!==this._editValues[e]&&this._editValues[e]!==this._deviceConfig[e])}async _handleApply(e){if(!this.hass||!this._deviceConfig)return;let t=[];switch(e){case"device-name":t=["name"];break;case"radio-settings":t=["tx_power","frequency","bandwidth","spreading_factor","coding_rate","path_hash_mode"]}const i={};for(const e of t)void 0!==this._editValues[e]&&(i[e]=this._editValues[e]);this._saving=!0;try{if((await Ce(this.hass,i,this.config?.node_prefix)).success){this._deviceConfig&&(this._deviceConfig={...this._deviceConfig,...i});for(const e of t)delete this._editValues[e];this._editValues={...this._editValues},this._showStatusMessage(`Saved: ${t.join(", ")}`,"success")}else this._showStatusMessage("Save failed","error")}catch(e){this._showStatusMessage(`Error: ${String(e)}`,"error")}finally{this._saving=!1}}async _copyToClipboard(e){try{await navigator.clipboard.writeText(e),this._showStatusMessage("Copied to clipboard","success")}catch{this._showStatusMessage("Failed to copy","error")}}_showStatusMessage(e,t){this._statusMessage={text:e,type:t},null!==this._statusMessageTimeout&&clearTimeout(this._statusMessageTimeout),this._statusMessageTimeout=window.setTimeout(()=>{this._statusMessage=null,this._statusMessageTimeout=null},5e3)}_handleNameSave(){const e=this._editValues.name;void 0!==e&&e!==this._deviceConfig?.name&&(this._confirmAction={title:"Rename Device",message:"Changing the device name will change all entity IDs for this device. Any automations, scripts, or dashboards referencing current entity IDs will need to be updated. Continue?",onConfirm:async()=>{await this._handleApply("device-name")}},this._confirmDialogOpen=!0)}_handleRebootFromModal(){this._settingsModalOpen=!1,this._confirmAction={title:"Reboot Device",message:"Are you sure you want to reboot the device? The device will be temporarily unavailable.",onConfirm:()=>this._executeDeviceCommand("reboot")},this._confirmDialogOpen=!0}async _executeDeviceCommand(e){if(this.hass)try{const t=await Se(this.hass,e,void 0,this.config?.node_prefix);t.success?this._showStatusMessage(`Device ${e} initiated`,"success"):this._showStatusMessage(`Command failed: ${t.response}`,"error")}catch(e){this._showStatusMessage(`Error: ${String(e)}`,"error")}}async _applyLocation(){if(this.hass&&this._deviceConfig){this._saving=!0;try{const e=["latitude","longitude"],t={};if("ha_location"===this._locationSource){const e=this.hass.states["zone.home"];if(!e||null==e.attributes.latitude||null==e.attributes.longitude)return void this._showStatusMessage("Could not read zone.home coordinates from Home Assistant","error");t.latitude=e.attributes.latitude,t.longitude=e.attributes.longitude}else for(const i of e)void 0!==this._editValues[i]&&(t[i]=this._editValues[i]);if(Object.keys(t).length>0){if(!(await Ce(this.hass,t,this.config?.node_prefix)).success)return void this._showStatusMessage("Failed to save coordinates","error");this._deviceConfig&&(this._deviceConfig={...this._deviceConfig,...t});for(const t of e)delete this._editValues[t];this._editValues={...this._editValues}}if(!(await async function(e,t,i){try{const o={type:"meshcore_chat/set_location_source",source:t};return i&&(o.entry_id=i),await e.callWS(o)}catch{return{success:!1}}}(this.hass,this._locationSource,this.config?.node_prefix)).success)return void this._showStatusMessage("Failed to update location source","error");await this._loadDeviceConfig(),this._showStatusMessage("Location settings applied","success")}catch(e){this._showStatusMessage(`Error: ${String(e)}`,"error")}finally{this._saving=!1}}}_showRegenIdentityConfirm(){this._confirmAction={title:"Regenerate Identity",message:"This will create a new cryptographic identity. All existing contacts will need to re-add your device. All entity IDs will change — automations, scripts, and dashboards using current entity IDs will need to be updated. This cannot be undone.",requireTyped:"REGENERATE",onConfirm:async()=>{if(!this.hass)return;const e=await async function(e,t){try{const i={type:"meshcore_chat/regenerate_identity"};return t&&(i.entry_id=t),await e.callWS(i)}catch{return{success:!1}}}(this.hass,this.config?.node_prefix);e.success?(this._showStatusMessage(`New identity created: ${e.new_pubkey?.slice(0,8)}...`,"success"),await this._loadDeviceConfig()):this._showStatusMessage("Identity regeneration failed","error")}},this._confirmDialogOpen=!0}_handleImportKeyConfirm(){this._importKeyValue.trim()&&(this._confirmAction={title:"Import Private Key",message:"Importing a private key changes the device identity. All entity IDs will change — automations, scripts, and dashboards using current entity IDs will need to be updated. A reboot is required after import.",onConfirm:()=>this._importIdentityKey()},this._confirmDialogOpen=!0)}async _importIdentityKey(){if(this.hass&&this._importKeyValue.trim())try{const e=await async function(e,t,i){try{const o={type:"meshcore_chat/import_identity",private_key:t};return i&&(o.entry_id=i),await e.callWS(o)}catch{return{success:!1}}}(this.hass,this._importKeyValue.trim(),this.config?.node_prefix);e.success?(this._importKeyValue="",this._showStatusMessage(`Identity imported: ${e.pubkey?.slice(0,8)}...`,"success"),await this._loadDeviceConfig()):this._showStatusMessage("Identity import failed","error")}catch(e){this._showStatusMessage(`Error: ${String(e)}`,"error")}}async _onConfirmAction(){if(this._confirmDialogOpen=!1,this._confirmAction)try{await this._confirmAction.onConfirm()}catch(e){this._error=`Error: ${String(e)}`}this._confirmAction=null}_onConfirmCancel(){this._confirmDialogOpen=!1,this._confirmAction=null}_onCommandDialogClose(){this._commandDialogOpen=!1}async _loadEntityRegistry(){if(this.hass&&!this._entityRegistryLoaded){this._entityRegistryLoaded=!0;try{const{meshcoreDeviceMap:e,deviceEntities:t}=await tt(this.hass);this._meshcoreDeviceMap=e,this._deviceEntities=t}catch(e){console.error("Failed to load entity registry:",e)}}}_getCompanionEntities(){if(!this.hass||!this.selectedDevice)return[];const e=this._getCompanionDeviceKey(),t=new Set(this._hiddenSensors[e]||[]),i=this.selectedDevice.entry_id,o=this._meshcoreDeviceMap[i];if(o&&this._deviceEntities[o])return this._deviceEntities[o].filter(e=>!t.has(e.entity_id));const r=this.selectedDevice.pubkey_prefix?.substring(0,6)?.toLowerCase()||"";if(!r)return[];const s=[];for(const[e,i]of Object.entries(this._deviceEntities))if(!Object.entries(this._meshcoreDeviceMap).some(([t,i])=>i===e&&(t.includes("_repeater_")||t.includes("_client_"))))for(const e of i)e.entity_id.toLowerCase().includes(r)&&!t.has(e.entity_id)&&s.push(e);return s.sort((e,t)=>e.sortOrder-t.sortOrder)}_getCompanionDeviceKey(){return this.selectedDevice?.entry_id||"companion"}_loadHiddenSensors(){try{const e=localStorage.getItem("meshcore-hidden-sensors");e&&(this._hiddenSensors=JSON.parse(e))}catch{this._hiddenSensors={}}}_saveHiddenSensors(){try{localStorage.setItem("meshcore-hidden-sensors",JSON.stringify(this._hiddenSensors))}catch{}}_hideSensor(e,t){const i=this._hiddenSensors[e]||[];i.includes(t)||(this._hiddenSensors={...this._hiddenSensors,[e]:[...i,t]},this._saveHiddenSensors())}_unhideSensor(e,t){const i=this._hiddenSensors[e]||[];if(this._hiddenSensors={...this._hiddenSensors,[e]:i.filter(e=>e!==t)},0===this._hiddenSensors[e].length){const t={...this._hiddenSensors};delete t[e],this._hiddenSensors=t}this._saveHiddenSensors()}_unhideAllSensors(e){const t={...this._hiddenSensors};delete t[e],this._hiddenSensors=t,this._saveHiddenSensors()}async _executeCompanionAction(e,t,i){if(!this.hass)return;const o=i||e;try{const i=await Se(this.hass,e,t,this.config?.node_prefix);this._showStatusMessage(`Companion: ${o} → ${i.response||"OK"}`,"success")}catch(e){this._showStatusMessage(`Companion: ${o} failed — ${String(e)}`,"error")}}_onTileContextMenu(e,t){const{entityId:i,label:o}=e.detail;this._contextMenu={entityId:i,label:o,deviceKey:t},this._overlayPointerStarted=!1}_onOverlayPointerDown(){this._overlayPointerStarted=!0}_closeContextMenu(){this._overlayPointerStarted&&(this._overlayPointerStarted=!1,this._contextMenu=null)}_hideSensorFromContext(){this._contextMenu&&(this._hideSensor(this._contextMenu.deviceKey,this._contextMenu.entityId),this._showStatusMessage(`Hidden: ${this._contextMenu.label}`,"success"),this._contextMenu=null)}_closeSettingsModal(){this._settingsModalOpen=!1}_openHiddenSensorsList(){this._hiddenSensorsModalKey=this._getCompanionDeviceKey(),this._settingsModalOpen=!1}_closeHiddenSensorsModal(){this._hiddenSensorsModalKey=null}_openCommandDialogForCompanion(){this._commandDialogOpen=!0,this._settingsModalOpen=!1}_openKeyManagementModal(){this._keyManagementModalOpen=!0,this._settingsModalOpen=!1}_closeKeyManagementModal(){this._keyManagementModalOpen=!1}};pt.styles=[ve,a`
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      .settings-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--primary-background-color, #fafafa);
      }

      .settings-container {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
      }

      .settings-container::-webkit-scrollbar {
        width: 6px;
      }

      .settings-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .settings-container::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb, var(--scrollbar-thumb-color, #c1c1c1));
        border-radius: 3px;
      }

      .section-row {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
      }

      .section-row.full {
        flex: 1;
      }

      .form-group-inline {
        flex: 1;
      }

      .danger-zone {
        margin-top: 16px;
        padding: 12px;
        border: 2px solid var(--error-color, #db4437);
        border-radius: 8px;
        background: rgba(219, 68, 55, 0.05);
      }

      .danger-zone-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--error-color, #db4437);
        margin-bottom: 12px;
      }

      .danger-zone-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .info-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .info-row:last-child {
        border-bottom: none;
      }

      .info-label {
        font-size: 13px;
        color: var(--secondary-text-color);
        font-weight: 500;
      }

      .info-value {
        font-size: 13px;
        color: var(--primary-text-color);
        font-family: monospace;
        font-weight: 500;
        word-break: break-all;
      }

      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        margin-bottom: 16px;
      }

      .settings-grid > .device-section {
        margin-bottom: 0;
      }

      @media (max-width: 768px) {
        .settings-grid {
          grid-template-columns: 1fr;
        }
      }

      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 16px;
      }

      /* ─── Companion Device Card Styles ─── */

      .device-section {
        background: var(--card-background-color, #fff);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 16px;
      }

      .companion-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }

      .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .section-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .section-icon.companion {
        background: rgba(3, 169, 244, 0.12);
        color: #0288d1;
      }

      .device-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .device-meta {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .device-meta span {
        margin-right: 12px;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        flex-shrink: 0;
      }

      .status-badge.online {
        background: rgba(76, 175, 80, 0.12);
        color: #2e7d32;
      }

      .status-badge.offline {
        background: rgba(114, 114, 114, 0.12);
        color: #616161;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }

      .status-dot.online {
        background: #4caf50;
      }

      .status-dot.offline {
        background: #9e9e9e;
      }

      .subsection-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--secondary-text-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
        margin-top: 16px;
      }

      .sensor-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }

      .actions-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 16px;
      }

      .action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 6px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .action-btn:hover:not(:disabled) {
        background: var(--secondary-background-color, #f5f5f5);
        border-color: var(--primary-color, #03a9f4);
      }

      .action-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .settings-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 8px;
        flex-shrink: 0;
      }

      .settings-btn:hover {
        background: var(--secondary-background-color, #f0f0f0);
        color: var(--primary-text-color);
      }

      /* Modal overlay */
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.15s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .modal-card {
        background: var(--card-background-color, #fff);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        min-width: 260px;
        max-width: 400px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .modal-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .modal-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
        font-size: 18px;
      }

      .modal-close:hover {
        background: var(--secondary-background-color, #f0f0f0);
      }

      .modal-body {
        padding: 8px 0;
        overflow-y: auto;
      }

      .modal-action {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 20px;
        cursor: pointer;
        transition: background 0.15s;
        color: var(--primary-text-color);
        font-size: 14px;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
      }

      .modal-action:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .modal-action.danger {
        color: var(--error-color, #db4437);
      }

      .modal-action-icon {
        display: flex;
        align-items: center;
        color: var(--secondary-text-color);
        flex-shrink: 0;
      }

      .modal-action.danger .modal-action-icon {
        color: var(--error-color, #db4437);
      }

      .modal-action:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .modal-action:disabled:hover {
        background: none;
      }

      .modal-divider {
        height: 1px;
        background: var(--divider-color, #e0e0e0);
        margin: 4px 0;
      }

      /* Hidden sensors list */
      .hidden-sensor-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 20px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .hidden-sensor-item:last-child {
        border-bottom: none;
      }

      .hidden-sensor-name {
        font-size: 13px;
        color: var(--primary-text-color);
      }

      .hidden-sensor-id {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .unhide-btn {
        padding: 4px 10px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 4px;
        background: var(--card-background-color, #fff);
        color: var(--primary-color, #03a9f4);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
      }

      .unhide-btn:hover {
        background: var(--secondary-background-color, #f5f5f5);
      }

      .modal-footer {
        padding: 12px 20px;
        border-top: 1px solid var(--divider-color, #e0e0e0);
        display: flex;
        justify-content: flex-end;
      }

      .empty-hidden {
        padding: 20px;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: 13px;
      }

      /* Status toast */
      .status-toast {
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 13px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
      }

      .status-toast.success {
        border-left: 4px solid #4caf50;
      }

      .status-toast.error {
        border-left: 4px solid var(--error-color, #db4437);
        color: var(--error-color, #db4437);
      }

      @keyframes slideIn {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `],e([me({type:Object})],pt.prototype,"hass",void 0),e([me({type:Object})],pt.prototype,"config",void 0),e([me({type:Boolean})],pt.prototype,"narrow",void 0),e([me({type:Object})],pt.prototype,"selectedDevice",void 0),e([ue()],pt.prototype,"_deviceConfig",void 0),e([ue()],pt.prototype,"_loading",void 0),e([ue()],pt.prototype,"_error",void 0),e([ue()],pt.prototype,"_editValues",void 0),e([ue()],pt.prototype,"_saving",void 0),e([ue()],pt.prototype,"_commandDialogOpen",void 0),e([ue()],pt.prototype,"_confirmAction",void 0),e([ue()],pt.prototype,"_confirmDialogOpen",void 0),e([ue()],pt.prototype,"_locationSource",void 0),e([ue()],pt.prototype,"_importKeyValue",void 0),e([ue()],pt.prototype,"_deviceEntities",void 0),e([ue()],pt.prototype,"_meshcoreDeviceMap",void 0),e([ue()],pt.prototype,"_entityRegistryLoaded",void 0),e([ue()],pt.prototype,"_hiddenSensors",void 0),e([ue()],pt.prototype,"_contextMenu",void 0),e([ue()],pt.prototype,"_settingsModalOpen",void 0),e([ue()],pt.prototype,"_keyManagementModalOpen",void 0),e([ue()],pt.prototype,"_hiddenSensorsModalKey",void 0),e([ue()],pt.prototype,"_statusMessage",void 0),pt=e([pe("meshcore-settings-page")],pt);let ht=class extends de{constructor(){super(...arguments),this.open=!1,this.contactName="",this.result=null,this.error="",this.availableRepeaters=[],this.targetContact=null,this.pathMode="discovery",this.pathHops=[],this.enteredPath="",this._repeaterFilter="",this._running=!1,this._onPathModeChange=e=>{this.pathMode=e.target.value},this._onExplicitPathInput=e=>{this.enteredPath=e.target.value},this._onRunTrace=()=>{if(!this._canRunTrace())return;const e="discovery"===this.pathMode?void 0:this._buildPathString();this._running=!0,this.dispatchEvent(new CustomEvent("trace-requested",{detail:{pathMode:this.pathMode,path:e},bubbles:!0,composed:!0}))}}willUpdate(e){if(e.has("open")&&this.open&&!e.get("open")){const e=this.targetContact;if(!e||2!==e.type&&3!==e.type&&4!==e.type)this.pathMode="discovery",this.pathHops=[];else{this.pathMode="select";const t=this._resolveCachedHops(e);this.pathHops=t||[]}this.enteredPath="",this._repeaterFilter="",this._running=!1}(e.has("result")&&this.result||e.has("error")&&this.error)&&(this._running=!1)}_resolveCachedHops(e){if(1!==(e.out_path_hash_mode??0))return null;const t=(e.out_path||"").toLowerCase(),i=e.out_path_len??0;if(!t||i<=0)return null;if(t.length<4*i)return null;const o=[];for(let e=0;e<i;e++){const i=t.substring(4*e,4*(e+1)),r=this.availableRepeaters.find(e=>(e.pubkey_prefix||"").toLowerCase().startsWith(i));if(!r)return null;o.push(r)}return o}render(){return this.open?j`
      <div class="dialog-backdrop" @click=${this._close}>
        <div class="dialog" @click=${e=>e.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Trace ${this.contactName}</div>
            <button class="dialog-close" @click=${this._close}>✕</button>
          </div>
          <div class="dialog-content">
            ${this._renderBody()}
          </div>
        </div>
      </div>
    `:j``}_renderBody(){return this.error?j`<div class="error-box">${this.error}</div>`:this.result?this._renderResult(this.result):this._running?j`<div class="info-value">Tracing…</div>`:this._renderInput()}_renderInput(){return j`
      <div class="form-group">
        <label class="form-label">Path Type</label>
        <select
          class="form-select"
          .value=${this.pathMode}
          @change=${this._onPathModeChange}
        >
          <option value="discovery">Path discovery (auto)</option>
          <option value="select">Select repeaters</option>
          <option value="explicit">Enter path</option>
        </select>
      </div>

      ${"discovery"===this.pathMode?j`<div class="info-item path-hint">
            Flood path discovery will find a route automatically. May time
            out if the target is many hops away or unreachable by flood.
          </div>`:"select"===this.pathMode?this._renderRepeaterPicker():this._renderExplicitInput()}

      ${"discovery"!==this.pathMode&&this._canRunTrace()?j`<div class="info-item">
            <div class="info-label">Resolved Path</div>
            <div class="resolved-path">${this._buildPathString()}</div>
          </div>`:j``}

      <div class="dialog-actions">
        <button
          class="btn-primary"
          ?disabled=${!this._canRunTrace()}
          @click=${this._onRunTrace}
        >
          Run Trace
        </button>
      </div>
    `}_renderRepeaterPicker(){const e=new Set(this.pathHops.map(e=>e.public_key)),t=this._repeaterFilter.trim().toLowerCase(),i=[...this.availableRepeaters].filter(t=>!e.has(t.public_key)).filter(e=>{if(!t)return!0;const i=(e.adv_name||"").toLowerCase(),o=(e.pubkey_prefix||"").toLowerCase();return i.includes(t)||o.startsWith(t)}).sort((e,t)=>(e.adv_name||"").localeCompare(t.adv_name||"")),o=this.targetContact?.adv_name||this.targetContact?.pubkey_prefix||"(no target)",r=this.targetContact?.pubkey_prefix?.substring(0,2).toUpperCase()||"--";return j`
      <div class="info-item">
        <div class="info-label">Repeaters (in order, source → target)</div>
        <div class="repeater-picker">
          <div class="picker-column">
            <div class="picker-column-label">Available</div>
            <input
              type="text"
              class="form-input picker-search"
              placeholder="Filter by name or pubkey prefix…"
              .value=${this._repeaterFilter}
              @input=${e=>{this._repeaterFilter=e.target.value}}
              autocomplete="off"
              spellcheck="false"
            />
            <div class="picker-list">
              ${0===i.length?j`<div class="picker-empty">${t?"No matches":"No repeaters available"}</div>`:i.map(e=>j`
                      <div
                        class="picker-item"
                        @click=${()=>this._addRepeater(e)}
                        title="Add ${e.adv_name}"
                      >
                        <span class="name">${e.adv_name||e.pubkey_prefix}</span>
                        <span class="hop-hex">${e.pubkey_prefix.substring(0,2).toUpperCase()}</span>
                      </div>
                    `)}
            </div>
          </div>
          <div class="picker-column">
            <div class="picker-column-label">Path</div>
            <div class="picker-list">
              ${0===this.pathHops.length?j`<div class="picker-empty">Click a repeater to add (or leave empty for direct-neighbor)</div>`:this.pathHops.map((e,t)=>j`
                      <div class="picker-item">
                        <span class="ordinal">${t+1}</span>
                        <span class="name">${e.adv_name||e.pubkey_prefix}</span>
                        <span class="hop-hex">${e.pubkey_prefix.substring(0,2).toUpperCase()}</span>
                        <button
                          class="picker-item-btn"
                          ?disabled=${0===t}
                          @click=${()=>this._moveRepeater(t,-1)}
                          title="Move up"
                        >▲</button>
                        <button
                          class="picker-item-btn"
                          ?disabled=${t===this.pathHops.length-1}
                          @click=${()=>this._moveRepeater(t,1)}
                          title="Move down"
                        >▼</button>
                        <button
                          class="picker-item-btn"
                          @click=${()=>this._removeRepeater(t)}
                          title="Remove"
                        >✕</button>
                      </div>
                    `)}
            </div>
          </div>
        </div>
      </div>

      <div class="info-item">
        <div class="info-label">Target</div>
        <div class="target-row">
          <span class="target-name">${o}</span>
          <span class="target-hex">${r}</span>
        </div>
      </div>
    `}_renderExplicitInput(){const e=!!this.enteredPath&&!this._isValidExplicitHops(),t=this.targetContact?.adv_name||this.targetContact?.pubkey_prefix||"(no target)",i=this.targetContact?.pubkey_prefix?.substring(0,2).toUpperCase()||"--";return j`
      <div class="info-item">
        <div class="info-label">Outbound Hops (comma-separated hex)</div>
        <input
          type="text"
          class="form-input"
          placeholder="AE  (or AE,CD for multiple hops, or empty for direct neighbor)"
          .value=${this.enteredPath}
          @input=${this._onExplicitPathInput}
          autocomplete="off"
          spellcheck="false"
        />
        <div class="path-hint">
          Enter outbound hops only — the target and return hops are added
          automatically.  For a direct-neighbor target, leave this empty.
          Each hop is 2, 4, or 8 hex chars (1, 2, or 4 bytes); all hops
          must be the same width.  1 byte is recommended — 2-byte and
          4-byte hashes may not complete round-trip in some meshes.
        </div>
        ${e?j`<div class="path-error">
              Invalid format — hex pairs separated by commas, all
              the same width (2, 4, or 8 chars).
            </div>`:j``}
      </div>
      <div class="info-item">
        <div class="info-label">Target</div>
        <div class="target-row">
          <span class="target-name">${t}</span>
          <span class="target-hex">${i}</span>
        </div>
      </div>
    `}_addRepeater(e){this.pathHops=[...this.pathHops,e]}_removeRepeater(e){this.pathHops=this.pathHops.filter((t,i)=>i!==e)}_moveRepeater(e,t){const i=e+t;if(i<0||i>=this.pathHops.length)return;const o=[...this.pathHops];[o[e],o[i]]=[o[i],o[e]],this.pathHops=o}_isValidExplicitHops(){const e=this.enteredPath.trim();if(!e)return!0;const t=e.split(",").map(e=>e.trim());if(0===t.length)return!1;const i=t[0].length;if(![2,4,8].includes(i))return!1;const o=/^[0-9a-fA-F]+$/;return t.every(e=>e.length===i&&o.test(e))}_canRunTrace(){return"discovery"===this.pathMode||("select"===this.pathMode?!!this.targetContact:"explicit"===this.pathMode&&!!this.targetContact&&this._isValidExplicitHops())}_buildPathString(){if("select"===this.pathMode){if(!this.targetContact)return"";const e=this.targetContact.pubkey_prefix.substring(0,2).toUpperCase(),t=this.pathHops.map(e=>e.pubkey_prefix.substring(0,2).toUpperCase());return 0===t.length?e:[...t,e,...[...t].reverse()].join(",")}if("explicit"===this.pathMode){if(!this.targetContact)return"";const e=this.targetContact.pubkey_prefix.substring(0,2).toUpperCase(),t=this.enteredPath.trim();if(!t)return e;const i=t.split(",").map(e=>e.trim().toUpperCase());return[...i,e,...[...i].reverse()].join(",")}return""}_renderResult(e){const t=(e.path||[]).filter(e=>e.hash);return j`
      <div class="info-item">
        <div class="info-label">Round Trip</div>
        <div class="info-value rtt-value">${e.response_time}</div>
      </div>

      <div class="info-item">
        <div class="info-label">Hops</div>
        <div class="info-value">
          ${0===e.hops?"Direct (0 hops)":`${e.hops}`}
        </div>
      </div>

      ${null!==e.final_snr&&void 0!==e.final_snr?j`
            <div class="info-item">
              <div class="info-label">Final SNR (at this device)</div>
              <div class="info-value">${e.final_snr.toFixed(2)} dB</div>
            </div>
          `:j``}

      ${t.length>0?j`
            <div class="info-item">
              <div class="info-label">Return Path (per-hop SNR)</div>
              <div class="hop-list">
                ${t.map((e,t)=>j`
                    <div class="hop-row">
                      <span>Hop ${t+1}: ${e.hash}</span>
                      <span>${e.snr.toFixed(2)} dB</span>
                    </div>
                  `)}
              </div>
            </div>
          `:j``}
    `}_close(){this.open=!1,this.dispatchEvent(new CustomEvent("trace-dialog-closed",{bubbles:!0,composed:!0}))}};ht.styles=[ve,a`
    :host { display: contents; }

    .dialog-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .dialog {
      background: var(--card-background-color, #fff);
      border-radius: 8px;
      max-width: 700px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 5px 25px rgba(0, 0, 0, 0.15);
      animation: slideUp 0.3s;
    }

    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }

    .dialog-title { font-size: 18px; font-weight: 600; color: var(--primary-text-color); }

    .dialog-close {
      background: none; border: none; font-size: 20px; cursor: pointer;
      color: var(--secondary-text-color); padding: 0;
      width: 32px; height: 32px;
      display: flex; align-items: center; justify-content: center;
    }

    .dialog-close:hover { color: var(--primary-text-color); }

    .dialog-content { padding: 16px; }

    .info-item {
      padding: 8px;
      background: var(--primary-background-color, #fafafa);
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .info-label {
      font-size: 11px; color: var(--secondary-text-color, #727272);
      text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;
    }

    .info-value {
      font-size: 13px; color: var(--primary-text-color);
      margin-top: 4px; font-family: monospace;
    }

    .rtt-value {
      font-size: 24px; font-weight: 600;
      font-family: inherit;
      color: var(--primary-color, #03a9f4);
    }

    .hop-list {
      margin-top: 4px;
      font-family: monospace;
      font-size: 12px;
    }

    .hop-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
    }

    .hop-row + .hop-row {
      border-top: 1px dashed var(--divider-color, #e0e0e0);
    }

    .error-box {
      padding: 12px;
      background: rgba(219, 68, 55, 0.08);
      border: 1px solid rgba(219, 68, 55, 0.2);
      border-radius: 6px;
      color: var(--error-color, #db4437);
      font-size: 13px;
    }

    /* Session 54 — input phase */

    select, input[type="text"] {
      width: 100%;
      padding: 8px 10px;
      margin-top: 4px;
      font-size: 14px;
      color: var(--primary-text-color);
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      box-sizing: border-box;
      font-family: inherit;
    }

    select:focus, input[type="text"]:focus {
      outline: none;
      border-color: var(--primary-color, #03a9f4);
    }

    input[type="text"] {
      font-family: monospace;
    }

    .path-hint {
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-style: italic;
      padding: 8px;
    }

    .path-error {
      margin-top: 6px;
      font-size: 12px;
      color: var(--error-color, #db4437);
    }

    .repeater-picker {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .picker-column {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .picker-column-label {
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }

    .picker-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 60px;
      max-height: 200px;
      overflow-y: auto;
      padding: 4px;
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
    }

    /* Session 56: picker-search now uses .form-input for sizing / padding
       / border / border-radius (panel-wide form convention).  Local
       .picker-search only supplies picker-column-specific spacing. */
    .picker-search {
      margin-bottom: 4px;
    }

    .picker-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      background: var(--primary-background-color, #fafafa);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }

    .picker-item:hover {
      background: var(--secondary-background-color, #eef);
    }

    .picker-item[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .picker-item .name {
      flex: 1;
      font-family: inherit;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .picker-item .hop-hex {
      font-family: monospace;
      font-size: 11px;
      color: var(--secondary-text-color, #727272);
    }

    .picker-item .ordinal {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      background: var(--primary-color, #03a9f4);
      color: var(--text-primary-color, #fff);
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
    }

    .picker-item-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--secondary-text-color);
      padding: 2px 4px;
      font-size: 14px;
      line-height: 1;
    }

    .picker-item-btn:hover:not(:disabled) {
      color: var(--primary-text-color);
    }

    .picker-item-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .picker-empty {
      padding: 12px 8px;
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
      font-style: italic;
      text-align: center;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 8px;
    }

    .btn-primary {
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary-color, #fff);
      background: var(--primary-color, #03a9f4);
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-primary:hover:not(:disabled) {
      filter: brightness(0.95);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .resolved-path {
      margin-top: 4px;
      font-family: monospace;
      font-size: 12px;
      color: var(--primary-text-color);
      background: var(--primary-background-color, #fafafa);
      padding: 6px 8px;
      border-radius: 4px;
      word-break: break-all;
    }

    /* Session 56: Target row for both Select and Enter-path modes. */
    .target-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(3, 169, 244, 0.08);
      border: 1px solid rgba(3, 169, 244, 0.25);
      border-radius: 6px;
      font-size: 13px;
      margin-top: 4px;
    }

    .target-row .target-name {
      flex: 1;
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .target-row .target-hex {
      font-family: monospace;
      font-size: 12px;
      color: var(--secondary-text-color, #727272);
    }
  `],e([me({type:Boolean})],ht.prototype,"open",void 0),e([me({type:String})],ht.prototype,"contactName",void 0),e([me({type:Object})],ht.prototype,"result",void 0),e([me({type:String})],ht.prototype,"error",void 0),e([me({type:Array})],ht.prototype,"availableRepeaters",void 0),e([me({type:Object})],ht.prototype,"targetContact",void 0),e([ue()],ht.prototype,"pathMode",void 0),e([ue()],ht.prototype,"pathHops",void 0),e([ue()],ht.prototype,"enteredPath",void 0),e([ue()],ht.prototype,"_repeaterFilter",void 0),e([ue()],ht.prototype,"_running",void 0),ht=e([pe("meshcore-trace-dialog")],ht);let gt=class extends de{constructor(){super(...arguments),this.open=!1,this.contacts=[],this._typeFilter="all",this._search="",this._boundKeydown=null,this._onTypeChange=e=>{this._typeFilter=e.target.value},this._onSearchInput=e=>{this._search=e.target.value},this._close=()=>{this.dispatchEvent(new CustomEvent("target-picker-closed",{bubbles:!0,composed:!0}))}}connectedCallback(){super.connectedCallback(),this._boundKeydown=e=>{this.open&&"Escape"===e.key&&(e.stopPropagation(),this._close())},document.addEventListener("keydown",this._boundKeydown)}disconnectedCallback(){super.disconnectedCallback(),this._boundKeydown&&(document.removeEventListener("keydown",this._boundKeydown),this._boundKeydown=null)}willUpdate(e){e.has("open")&&this.open&&!e.get("open")&&(this._typeFilter="all",this._search="")}render(){if(!this.open)return j``;const e=this._search.trim().toLowerCase(),t=this.contacts.filter(e=>{switch(this._typeFilter){case"all":default:return!0;case"client":return 1===e.type;case"repeater":return 2===e.type;case"room_server":return 3===e.type;case"sensor":return 4===e.type}}).filter(t=>{if(!e)return!0;const i=(t.adv_name||"").toLowerCase(),o=(t.pubkey_prefix||"").toLowerCase();return i.includes(e)||o.startsWith(e)}).sort((e,t)=>(e.adv_name||"").localeCompare(t.adv_name||""));return j`
      <div class="dialog-backdrop" @click=${this._close}>
        <div class="dialog" @click=${e=>e.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Choose Trace Target</div>
            <button class="dialog-close" @click=${this._close} title="Close">✕</button>
          </div>
          <div class="dialog-content">
            <div class="filter-row">
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Type</label>
                <select
                  class="form-select"
                  .value=${this._typeFilter}
                  @change=${this._onTypeChange}
                >
                  <option value="all">All</option>
                  <option value="client">Companion / Client</option>
                  <option value="repeater">Repeater</option>
                  <option value="room_server">Room Server</option>
                  <option value="sensor">Sensor</option>
                </select>
              </div>
              <div class="form-group" style="margin: 0;">
                <label class="form-label">Search</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="Name or pubkey prefix…"
                  .value=${this._search}
                  @input=${this._onSearchInput}
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            </div>
            <div class="results-list">
              ${0===t.length?j`<div class="empty">No matching contacts</div>`:t.map(e=>j`
                    <div
                      class="result-row"
                      @click=${()=>this._select(e)}
                      title="Trace to ${e.adv_name||e.pubkey_prefix}"
                    >
                      <span class="result-icon">${this._iconFor(e.type)}</span>
                      <span class="result-name">${e.adv_name||e.pubkey_prefix}</span>
                      <span class="result-hex">${(e.pubkey_prefix||"").substring(0,2).toUpperCase()}</span>
                    </div>
                  `)}
            </div>
          </div>
        </div>
      </div>
    `}_iconFor(e){switch(e){case 2:return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V10h4.27c.15-.86.45-1.66.87-2.36l-1.82-1.06a.5.5 0 01-.18-.68l.5-.87a.5.5 0 01.68-.18l1.81 1.05C19.66 4.66 20.78 4 22 4v2c-.8 0-1.54.32-2.08.84l1.5 2.6a.5.5 0 01-.18.68l-.87.5a.5.5 0 01-.68-.18L18.2 7.92c-.14.65-.2 1.33-.2 2.08 0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6z"/></svg>`;case 3:return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4 6h16v4H4V6zm0 8h16v4H4v-4zm2-6.5A.5.5 0 116 7a.5.5 0 010 .5zm0 8A.5.5 0 116 15a.5.5 0 010 .5z"/></svg>`;case 4:return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a4 4 0 00-4 4v7.55A5.5 5.5 0 1015.5 20a5.47 5.47 0 00.5-2.45V6a4 4 0 00-4-4zm0 2a2 2 0 012 2v8.1a3.5 3.5 0 11-4 0V6a2 2 0 012-2z"/></svg>`;default:return j`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`}}_select(e){this.dispatchEvent(new CustomEvent("target-selected",{detail:e,bubbles:!0,composed:!0}))}};gt.styles=[ve,a`
      :host { display: contents; }

      .dialog-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        animation: fadeIn 0.2s;
      }

      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

      .dialog {
        background: var(--card-background-color, #fff);
        border-radius: 8px;
        max-width: 560px;
        width: 90%;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 5px 25px rgba(0, 0, 0, 0.15);
        animation: slideUp 0.3s;
      }

      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
      }

      .dialog-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .dialog-close {
        background: none; border: none; font-size: 20px; cursor: pointer;
        color: var(--secondary-text-color); padding: 0;
        width: 32px; height: 32px;
        display: flex; align-items: center; justify-content: center;
      }

      .dialog-close:hover { color: var(--primary-text-color); }

      .dialog-content {
        padding: 16px;
        overflow-y: auto;
      }

      .filter-row {
        display: grid;
        grid-template-columns: minmax(140px, 200px) 1fr;
        gap: 8px;
        margin-bottom: 12px;
      }

      @media (max-width: 520px) {
        .filter-row { grid-template-columns: 1fr; }
      }

      .results-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 50vh;
        overflow-y: auto;
        padding: 4px;
        background: var(--primary-background-color, #fafafa);
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 6px;
      }

      .result-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--card-background-color, #fff);
        border-radius: 6px;
        cursor: pointer;
        user-select: none;
        font-size: 14px;
        transition: background 0.15s;
      }

      .result-row:hover {
        background: var(--secondary-background-color, #eef);
      }

      .result-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        color: var(--primary-color, #03a9f4);
        flex-shrink: 0;
      }

      .result-name {
        flex: 1;
        color: var(--primary-text-color);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .result-hex {
        font-family: monospace;
        font-size: 12px;
        color: var(--secondary-text-color, #727272);
        flex-shrink: 0;
      }

      .empty {
        padding: 24px 12px;
        text-align: center;
        color: var(--secondary-text-color, #727272);
        font-style: italic;
        font-size: 13px;
      }
    `],e([me({type:Boolean})],gt.prototype,"open",void 0),e([me({type:Array})],gt.prototype,"contacts",void 0),e([ue()],gt.prototype,"_typeFilter",void 0),e([ue()],gt.prototype,"_search",void 0),gt=e([pe("meshcore-target-picker")],gt);let mt=class extends de{constructor(){super(...arguments),this.narrow=!1,this._config=null,this._activeTab="chat",this._devices=[],this._contacts=[],this._channels=[],this._selectedEntryId=null,this._loading=!0,this._loadingStarted=!1,this._error=null,this._unsubscribeList=[],this._unreadCounts={},this._pendingChatTarget=null,this._activeChatEntityId=null,this._traceDialogOpen=!1,this._traceDialogContactName="",this._traceDialogResult=null,this._traceDialogError="",this._traceDialogPubkeyPrefix="",this._traceDialogEntryId=void 0,this._traceDialogTargetContact=null,this._targetPickerOpen=!1,this._pendingTraceEntryId=void 0,this._boundVisibilityHandler=null,this._onTraceRequested=async e=>{if(!this.hass)return;const{pathMode:t,path:i}=e.detail;try{const e=await async function(e,t,i,o="discovery",r){const s={type:"meshcore_chat/trace",pubkey_prefix:t};return i&&(s.entry_id=i),"select"!==o&&"explicit"!==o||!r||(s.path=r),e.callWS(s)}(this.hass,this._traceDialogPubkeyPrefix,this._traceDialogEntryId,t,i);this._traceDialogResult=e}catch(e){this._traceDialogError=e?.message||e?.code||"Unknown error"}},this._onCompanionTraceRequested=e=>{this._pendingTraceEntryId=e.detail?.entryId??this._selectedEntryId??void 0,this._targetPickerOpen=!0},this._onTargetPicked=e=>{const t=e.detail;this._targetPickerOpen=!1,t&&(this._traceDialogPubkeyPrefix=t.pubkey_prefix,this._traceDialogEntryId=this._pendingTraceEntryId,this._traceDialogContactName=t.adv_name||t.pubkey_prefix,this._traceDialogTargetContact=t,this._traceDialogResult=null,this._traceDialogError="",this._traceDialogOpen=!0)}}connectedCallback(){super.connectedCallback(),this._loadData(),this._setupSubscriptions(),this._boundVisibilityHandler=()=>this._onVisibilityChange(),document.addEventListener("visibilitychange",this._boundVisibilityHandler)}disconnectedCallback(){super.disconnectedCallback(),this._teardownSubscriptions(),this._boundVisibilityHandler&&(document.removeEventListener("visibilitychange",this._boundVisibilityHandler),this._boundVisibilityHandler=null)}_setupSubscriptions(){this._teardownSubscriptions(),this.hass?.connection?.subscribeEvents&&(this.hass.connection.subscribeEvents(e=>{e.data.entry_id===this._selectedEntryId&&this._loadDeviceData()},"meshcore_channels_updated").then(e=>{this._unsubscribeList.push(e)}),this.hass.connection.subscribeEvents(e=>{e.data.entry_id===this._selectedEntryId&&this._loadDeviceData()},"meshcore_channel_removed").then(e=>{this._unsubscribeList.push(e)}),this.hass.connection.subscribeEvents(e=>{this._activeChatEntityId&&e.data?.entity_id===this._activeChatEntityId||this._loadUnreadCounts()},"meshcore_unread_updated").then(e=>{this._unsubscribeList.push(e)}))}_teardownSubscriptions(){this._unsubscribeList.length>0&&(this._unsubscribeList.forEach(e=>{try{e()}catch(e){}}),this._unsubscribeList=[])}_onVisibilityChange(){"visible"===document.visibilityState&&(this._setupSubscriptions(),this._loadDeviceData(),this._loadUnreadCounts())}updated(e){e.has("hass")&&this.hass&&!this._config&&!this._loadingStarted&&this._loadData()}get _selectedDevice(){return this._devices.find(e=>e.entry_id===this._selectedEntryId)}render(){if(this._loading)return j`
        <div class="panel">
          <div class="center-message">
            <div class="spinner"></div>
          </div>
        </div>
      `;if(this._error&&!this._config)return j`
        <div class="panel">
          <div class="center-message">
            <div>
              <p>${this._error}</p>
              <p style="font-size: 12px; margin-top: 8px;">
                Check that the MeshCore integration is loaded and connected.
              </p>
            </div>
          </div>
        </div>
      `;const e=this._selectedDevice;return j`
      <div class="panel">
        <div class="panel-header">
          <div class="header-left">
            ${this.narrow||"always_hidden"===this.hass?.dockedSidebar?j`<button class="menu-icon" @click=${this._toggleMenu} aria-label="Toggle sidebar">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
                </button>`:j``}
            <div class="panel-title">MeshCore Chat</div>
          </div>
          <div class="header-right">
            ${e&&null!==this._getNodeStatus(e)?j`
                  <span class="connection-status ${"online"===this._getNodeStatus(e)?"online":"offline"}">
                    <span class="status-dot ${"online"===this._getNodeStatus(e)?"online":"offline"}"></span>
                    ${"online"===this._getNodeStatus(e)?"Connected":"Disconnected"}
                  </span>`:j``}
            ${e&&null!==this._getBatteryLevel(e)?j`
                  <span class="battery-indicator">
                    <span class="battery-icon">
                      <span class="battery-fill ${this._getBatteryLevel(e)>50?"high":this._getBatteryLevel(e)>20?"medium":"low"}"
                            style="width: ${this._getBatteryLevel(e)}%"></span>
                    </span>
                    <span class="battery-pct">${this._getBatteryLevel(e)}%</span>
                  </span>`:j``}
            ${this._devices.length>1?j`
                  <select
                    class="device-switcher"
                    .value=${this._selectedEntryId||""}
                    @change=${this._onDeviceChange}>
                    ${this._devices.map(e=>j`
                        <option value=${e.entry_id}>
                          ${e.name} ${e.connected?"":"(offline)"}
                        </option>
                      `)}
                  </select>
                `:j`<span class="device-info">${e?.name||""}</span>`}
          </div>
        </div>

        ${this._error?j`<div class="error-banner">${this._error}</div>`:j``}

        <div class="tab-bar">
          <button
            class=${"chat"===this._activeTab?"active":""}
            @click=${()=>this._activeTab="chat"}>
            Chat
          </button>
          <button
            class=${"devices"===this._activeTab?"active":""}
            @click=${()=>this._activeTab="devices"}>
            Devices
          </button>
          <button
            class=${"nodes"===this._activeTab?"active":""}
            @click=${()=>this._activeTab="nodes"}>
            Nodes
          </button>
          <button
            class=${"settings"===this._activeTab?"active":""}
            @click=${()=>this._activeTab="settings"}>
            Settings
          </button>
        </div>

        <div class="page-container">
          ${this._renderActivePage()}
        </div>

        <meshcore-trace-dialog
          ?open=${this._traceDialogOpen}
          .contactName=${this._traceDialogContactName}
          .result=${this._traceDialogResult}
          .error=${this._traceDialogError}
          .availableRepeaters=${this._contacts.filter(e=>2===e.type||3===e.type||4===e.type)}
          .targetContact=${this._traceDialogTargetContact}
          @trace-requested=${this._onTraceRequested}
          @trace-dialog-closed=${()=>{this._traceDialogOpen=!1}}>
        </meshcore-trace-dialog>

        <meshcore-target-picker
          ?open=${this._targetPickerOpen}
          .contacts=${this._contacts}
          @target-selected=${this._onTargetPicked}
          @target-picker-closed=${()=>{this._targetPickerOpen=!1}}>
        </meshcore-target-picker>
      </div>
    `}_renderActivePage(){switch(this._activeTab){case"chat":return j`
          <meshcore-chat-page
            .hass=${this.hass}
            .config=${this._config}
            .conversations=${[...this._channels,...this._contacts.filter(e=>e.added_to_node)]}
            .unreadCounts=${this._unreadCounts}
            .selectedId=${this._pendingChatTarget}
            .narrow=${this.narrow}
            @unread-cleared=${this._onUnreadCleared}
            @active-entity-changed=${this._onActiveEntityChanged}
            @contacts-changed=${()=>this._loadDeviceData()}
            @channels-changed=${()=>this._loadDeviceData()}></meshcore-chat-page>`;case"devices":return j`
          <meshcore-devices-page
            .hass=${this.hass}
            .config=${this._config}
            .selectedDevice=${this._selectedDevice}
            .narrow=${this.narrow}></meshcore-devices-page>`;case"nodes":return j`
          <meshcore-nodes-page
            .hass=${this.hass}
            .contacts=${this._contacts}
            .channels=${this._channels}
            .narrow=${this.narrow}
            @node-action=${this._handleNodeAction}
            @contacts-changed=${()=>this._loadDeviceData()}></meshcore-nodes-page>`;case"settings":return j`
          <meshcore-settings-page
            .hass=${this.hass}
            .config=${this._config}
            .selectedDevice=${this._selectedDevice}
            .narrow=${this.narrow}
            @companion-trace-requested=${this._onCompanionTraceRequested}></meshcore-settings-page>`}}_toggleMenu(){this.dispatchEvent(new Event("hass-toggle-menu",{bubbles:!0,composed:!0}))}_deviceEntitySuffix(e){return{prefix:(e.pubkey_prefix||e.pubkey||"").substring(0,6).toLowerCase(),name:(e.name||"").toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")}}_getNodeStatus(e){if(!this.hass)return null;const{prefix:t,name:i}=this._deviceEntitySuffix(e),o=`sensor.meshcore_${t}_node_status_${i}`,r=this.hass.states[o];return r?r.state:null}_getBatteryLevel(e){if(!this.hass)return null;const{prefix:t,name:i}=this._deviceEntitySuffix(e),o=`sensor.meshcore_${t}_battery_percentage_${i}`,r=this.hass.states[o];if(!r||"unknown"===r.state||"unavailable"===r.state)return null;const s=parseFloat(r.state);return isNaN(s)?null:Math.round(s)}_onDeviceChange(e){const t=e.target;this._selectedEntryId=t.value||null,this._loadDeviceData()}async _loadData(){if(this.hass&&!this._loadingStarted){this._loadingStarted=!0,this._loading=!0,this._error=null;try{const e=await async function(e){try{return(await e.callWS({type:"meshcore_chat/get_devices"})).devices||[]}catch{return[]}}(this.hass);if(this._devices=e,0===e.length)return this._error="No MeshCore devices found",void(this._loading=!1);const t=e.find(e=>e.connected);this._selectedEntryId=(t||e[0]).entry_id;const i=t||e[0];this._config={node_name:i.name,node_prefix:i.pubkey_prefix?.substring(0,6)||"",..._e,...xe},await this._loadDeviceData(),await this._loadUnreadCounts()}catch(e){const t=e instanceof Error?e.message:String(e);this._error=`Failed to load: ${t}`,console.error("MeshCore panel load error:",e)}finally{this._loading=!1}}}async _loadDeviceData(){if(this.hass&&this._selectedEntryId)try{const[e,t]=await Promise.all([we(this.hass,this._selectedEntryId),$e(this.hass,this._selectedEntryId)]);this._contacts=e,this._channels=t;const i=this._selectedDevice;i&&this._config&&(this._config={...this._config,node_name:i.name,node_prefix:i.pubkey_prefix?.substring(0,6)||""})}catch(e){console.error("Failed to load device data:",e)}}_onUnreadCleared(e){const{entityId:t}=e.detail;t&&this._unreadCounts[t]&&(this._unreadCounts={...this._unreadCounts,[t]:0})}_onActiveEntityChanged(e){this._activeChatEntityId=e.detail?.entityId||null}async _loadUnreadCounts(){if(this.hass)try{const e=await async function(e,t){try{const i={type:"meshcore_chat/get_unread_counts"};return t&&(i.entry_id=t),(await e.callWS(i)).unread||{}}catch{return{}}}(this.hass,this._selectedEntryId||void 0);this._activeChatEntityId&&e[this._activeChatEntityId]&&(e[this._activeChatEntityId]=0),this._unreadCounts=e}catch{}}async _handleNodeAction(e){const{action:t,node:i}=e.detail;if(!this.hass||!i)return;const o=i.public_key||"",r=i.pubkey_prefix||"",s=this._selectedEntryId||void 0;switch(t){case"message":r&&(this._pendingChatTarget=r,this._activeTab="chat");break;case"remove-contact":if(o)try{await Ae(this.hass,o,s),await this._loadDeviceData(),await this._refreshNodesPageAfterMutation(o)}finally{this._clearNodesPagePending()}break;case"add-contact":if(o)try{await ze(this.hass,o,i.adv_name||void 0,s),await this._loadDeviceData(),await this._refreshNodesPageAfterMutation(o)}finally{this._clearNodesPagePending()}break;case"trace":r&&(this._traceDialogPubkeyPrefix=r,this._traceDialogEntryId=s,this._traceDialogContactName=i.adv_name||r,this._traceDialogTargetContact="adv_name"in i?i:null,this._traceDialogResult=null,this._traceDialogError="",this._traceDialogOpen=!0);break;case"delete":case"remove":o&&(await Ae(this.hass,o,s),await this._loadDeviceData());break;default:console.warn("Unhandled node action:",t)}}async _refreshNodesPageAfterMutation(e){const t=this.shadowRoot?.querySelector("meshcore-nodes-page");if(t&&"function"==typeof t.refreshAfterMutation)try{await t.refreshAfterMutation(e)}catch(e){console.error("Failed to refresh nodes-page after mutation:",e)}}_clearNodesPagePending(){const e=this.shadowRoot?.querySelector("meshcore-nodes-page");e&&"function"==typeof e.clearPendingAction&&e.clearPendingAction()}};mt.styles=[ve,a`
      :host {
        display: block;
        width: 100%;
        height: 100vh;
      }

      .panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--primary-background-color, #fafafa);
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--card-background-color, #fff);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        flex-shrink: 0;
        gap: 12px;
      }

      .panel-title {
        font-size: 18px;
        font-weight: 500;
        color: var(--primary-text-color);
      }

      .device-info {
        font-size: 13px;
        color: var(--secondary-text-color);
      }

      .device-switcher {
        padding: 8px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color);
        font-size: 13px;
        box-sizing: border-box;
        height: 39px;
        min-height: 39px;
        line-height: normal;
        appearance: menulist;
        -webkit-appearance: menulist;
        cursor: pointer;
        max-width: 250px;
      }

      .menu-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: none;
        cursor: pointer;
        color: var(--primary-text-color);
        border-radius: 50%;
        padding: 0;
        flex-shrink: 0;
      }

      .menu-icon:hover {
        background: var(--secondary-background-color, rgba(0, 0, 0, 0.1));
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
        flex: 1;
      }

      .header-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }

      .connection-status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid;
      }

      .connection-status.online {
        color: #4caf50;
        border-color: rgba(76, 175, 80, 0.4);
        background: rgba(76, 175, 80, 0.08);
      }

      .connection-status.offline {
        color: var(--error-color, #db4437);
        border-color: rgba(219, 68, 55, 0.4);
        background: rgba(219, 68, 55, 0.08);
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .status-dot.online {
        background: #4caf50;
      }

      .status-dot.offline {
        background: var(--error-color, #db4437);
      }

      .battery-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 500;
        color: var(--secondary-text-color);
      }

      .battery-icon {
        position: relative;
        width: 18px;
        height: 10px;
        border: 1.5px solid var(--secondary-text-color, #888);
        border-radius: 2px;
        display: flex;
        align-items: center;
        padding: 1px;
      }

      .battery-icon::after {
        content: '';
        position: absolute;
        right: -4px;
        top: 50%;
        transform: translateY(-50%);
        width: 2px;
        height: 5px;
        background: var(--secondary-text-color, #888);
        border-radius: 0 1px 1px 0;
      }

      .battery-fill {
        height: 100%;
        border-radius: 1px;
        transition: width 0.3s ease;
      }

      .battery-fill.high {
        background: #4caf50;
      }

      .battery-fill.medium {
        background: #ff9800;
      }

      .battery-fill.low {
        background: var(--error-color, #db4437);
      }

      .battery-pct {
        min-width: 28px;
        text-align: right;
      }

      /* Mobile: compact header indicators */
      @media (max-width: 870px) {
        .connection-status {
          padding: 0;
          border: none;
          background: none !important;
          gap: 0;
          font-size: 0;
        }

        .connection-status .status-dot {
          width: 8px;
          height: 8px;
        }

        .battery-pct {
          display: none;
        }

        .battery-indicator {
          gap: 0;
        }

        .battery-icon {
          width: 13.5px;
          height: 7.5px;
          border-width: 1.25px;
        }

        .battery-icon::after {
          right: -3px;
          width: 1.5px;
          height: 4px;
        }
      }

      .tab-bar {
        display: flex;
        background: var(--card-background-color, #fff);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        flex-shrink: 0;
      }

      .tab-bar button {
        flex: 1;
        padding: 12px 16px;
        border: none;
        background: transparent;
        color: var(--secondary-text-color, #727272);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border-bottom: 3px solid transparent;
        min-height: 48px;
      }

      .tab-bar button:hover {
        color: var(--primary-text-color);
        background: rgba(0, 0, 0, 0.02);
      }

      .tab-bar button.active {
        color: var(--primary-color, #03a9f4);
        border-bottom-color: var(--primary-color, #03a9f4);
      }

      .page-container {
        flex: 1;
        overflow: hidden;
        display: flex;
      }

      .page-container > * {
        flex: 1;
        overflow: hidden;
      }

      .error-banner {
        padding: 12px 16px;
        background: rgba(219, 68, 55, 0.08);
        color: var(--error-color, #db4437);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        font-size: 13px;
      }

      .center-message {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        color: var(--secondary-text-color);
        padding: 24px;
      }

      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--divider-color, #e0e0e0);
        border-top-color: var(--primary-color, #03a9f4);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `],e([me({type:Object})],mt.prototype,"hass",void 0),e([me({type:Boolean})],mt.prototype,"narrow",void 0),e([me({type:Object})],mt.prototype,"panel",void 0),e([ue()],mt.prototype,"_config",void 0),e([ue()],mt.prototype,"_activeTab",void 0),e([ue()],mt.prototype,"_devices",void 0),e([ue()],mt.prototype,"_contacts",void 0),e([ue()],mt.prototype,"_channels",void 0),e([ue()],mt.prototype,"_selectedEntryId",void 0),e([ue()],mt.prototype,"_loading",void 0),e([ue()],mt.prototype,"_loadingStarted",void 0),e([ue()],mt.prototype,"_error",void 0),e([ue()],mt.prototype,"_unsubscribeList",void 0),e([ue()],mt.prototype,"_unreadCounts",void 0),e([ue()],mt.prototype,"_pendingChatTarget",void 0),e([ue()],mt.prototype,"_traceDialogOpen",void 0),e([ue()],mt.prototype,"_traceDialogContactName",void 0),e([ue()],mt.prototype,"_traceDialogResult",void 0),e([ue()],mt.prototype,"_traceDialogError",void 0),e([ue()],mt.prototype,"_traceDialogPubkeyPrefix",void 0),e([ue()],mt.prototype,"_traceDialogEntryId",void 0),e([ue()],mt.prototype,"_traceDialogTargetContact",void 0),e([ue()],mt.prototype,"_targetPickerOpen",void 0),e([ue()],mt.prototype,"_pendingTraceEntryId",void 0),mt=e([pe("meshcore-chat-panel")],mt),document.addEventListener("visibilitychange",()=>{"visible"===document.visibilityState&&setTimeout(()=>{const e=document.querySelector("ha-panel-custom");e&&(e.querySelector("meshcore-chat-panel")||(console.warn("[MeshCore] Panel destroyed by suspendWhenHidden — reloading page"),window.location.reload()))},500)});export{mt as MeshCorePanel};
