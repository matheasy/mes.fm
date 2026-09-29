/** mes.fm's footer, as on mes.fm/crypto (#footer): styles live in SiteChrome.css, and the links are
 * absolute mes.fm URLs for the reason given in SiteChrome.tsx. */
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <div className="mes-footer" role="contentinfo">
      <div className="mes-footer-items">
        <div className="mes-footer-item">
          <a className="mes-footer-text mes-footer-text--title" href="https://mes.fm/calculators">
            Calculators
          </a>
        </div>
        <div className="mes-footer-item">
          <a className="mes-footer-text mes-footer-text--title" href="https://mes.fm/tools">
            Tools
          </a>
        </div>
        <div className="mes-footer-item mes-footer-item--extra-padding">
          <a className="mes-footer-text mes-footer-text--title" href="https://mes.fm/mobile-apps">
            Mobile Apps
          </a>
        </div>
        <div className="mes-footer-item">
          <a className="mes-footer-text mes-footer-text--title" href="https://mes.fm">
            MES.fm
          </a>
        </div>
      </div>
      <a className="mes-footer-text" href="https://mes.fm/contact">
        Contact Us
      </a>
      <span className="mes-footer-sep"> | </span>
      <a className="mes-footer-text" href="https://mes.fm/privacy-policy">
        Privacy Policy
      </a>
      <span className="mes-footer-sep"> | </span>
      <a className="mes-footer-text" target="_blank" href="https://mes.fm/donate">
        Donate
      </a>
      <span className="mes-footer-sep"> | </span>
      <a className="mes-footer-text" target="_blank" rel="nofollow" href="https://matheasy.substack.com/">
        Subscribe
      </a>
      <div className="mes-footer-extra-info">
        <span className="mes-footer-text mes-footer-copyright">Copyright &copy; {year}&nbsp;Math Easy Solutions</span>
      </div>
    </div>
  );
}
