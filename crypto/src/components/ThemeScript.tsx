/** Runs in <head> before first paint: applies the saved light theme and text size (the same
 * `theme` / `articleFontScale` localStorage keys as the static mes.fm pages), so the page doesn't
 * flash dark or jump in size while React loads. The <html> element carries suppressHydrationWarning
 * because this changes its class and style before hydration. */
const SCRIPT = `try{var d=document.documentElement;if(localStorage.getItem('theme')==='light'){d.classList.add('light');d.classList.remove('dark')}var s=parseFloat(localStorage.getItem('articleFontScale'));if([75,87.5,100,112.5,125,137.5,150,162.5,175,200].indexOf(s)>-1)d.style.fontSize=s+'%';var m=localStorage.getItem('pageMode');if(m!=='std')d.classList.add('page-wide');if(m==='theatre')d.classList.add('page-theatre')}catch(e){d.classList.add('page-wide')}`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
