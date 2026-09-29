/** Same footer every mes.fm page carries (columns + Contact/Privacy/Donate/Subscribe + copyright),
 * matching mes.fm/crypto's #footer - see SiteChrome.tsx for why these are absolute mes.fm URLs. */
export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 rounded-xl bg-[#277bb6] p-6 text-white sm:p-8">
      <div className="mb-6 flex flex-wrap gap-x-10 gap-y-3">
        <a href="https://mes.fm/calculators" className="text-base italic hover:underline">
          Calculators
        </a>
        <a href="https://mes.fm/tools" className="text-base italic hover:underline">
          Tools
        </a>
        <a href="https://mes.fm/mobile-apps" className="text-base italic hover:underline">
          Mobile Apps
        </a>
        <a href="https://mes.fm" className="text-base italic hover:underline">
          MES.fm
        </a>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-2">
          <a href="https://mes.fm/contact" className="hover:underline">
            Contact Us
          </a>
          <span>|</span>
          <a href="https://mes.fm/privacy-policy" className="hover:underline">
            Privacy Policy
          </a>
          <span>|</span>
          <a href="https://mes.fm/donate" target="_blank" className="hover:underline">
            Donate
          </a>
          <span>|</span>
          <a href="https://matheasy.substack.com/" target="_blank" rel="nofollow" className="hover:underline">
            Subscribe
          </a>
        </div>
        <span>Copyright &copy; {year} Math Easy Solutions</span>
      </div>
    </footer>
  );
}
