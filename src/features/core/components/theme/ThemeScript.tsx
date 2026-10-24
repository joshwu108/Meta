/**
 * Applies the stored theme (`localStorage.cg-theme` = light | dark) before first paint so there
 * is no flash. With no stored value the tokens follow `prefers-color-scheme`.
 */
const script = `(function(){try{var t=localStorage.getItem('cg-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
