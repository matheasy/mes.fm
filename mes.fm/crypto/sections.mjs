// Content for mes.fm/crypto ("MES Crypto") and its Posts page mes.fm/crypto-posts. Hand-maintained; read by build.mjs.
//
// Add a new post at the TOP of the list (newest first) and run `npm run build`. Item shape: { title, image, links: [[label, href], ...] }.
// Then refresh img/crypto-posts-icon.jpg (900x600 crop of the newest post's image) and bump iconVersion in build.mjs PAGES.

export const SECTIONS = [
  {
    id: "crypto-posts",
    title: "Posts",
    items: [
  { title: "Canada's First Stablecoin $CADD Is Live on Solana", image: "https://mes.fm/cadd-stablecoin-solana/img/cadd-stablecoin-solana.jpg", links: [["mes.fm", "https://mes.fm/cadd-stablecoin-solana"]] },
  { title: "3Speak Now Pays Users a 10% Share of Ad Revenue for Watching", image: "https://img.leopedia.io/DQmYC1gpEkjBkby4mqB1xU2SP5Cnv1bvohTQtKzD1kGPjWk/telegram-cloud-photo-size-1-4999448963589021590-y.jpg", links: [["mes.fm", "https://mes.fm/3speak-ad-revenue-sharing"]] },
  { title: "The Top 10 S&P 500 Stocks Are 41% of the Market, and Oil Is at Record Lows Vs. Stocks", image: "https://img.leopedia.io/DQmdvuyozcMSZ2zM1rVXEqXz7Q2YosiM3Gq5Dog4FQGsdSc/telegram-cloud-photo-size-1-4999448963589020306-y.jpg", links: [["mes.fm", "https://mes.fm/stock-market-vs-oil"]] },
  { title: "Crypto News: Alex Jones on Your $XRP and a $320M $BTC Hack", image: "https://mes.fm/alex-jones-xrp-bitcoin/img/crypto-news-1-10Sz8k.jpg", links: [["mes.fm", "https://mes.fm/alex-jones-xrp-bitcoin"]] },
  { title: "The Hyperliquid Crypto Exchange Flagged My Wallet Address", image: "https://img.leopedia.io/DQmNyMvvspTTTFaNxWzjgJDxJ6ZC3fPpsQ3ggDnjGjgToS1/telegram-cloud-photo-size-1-4936468297599880198-y.jpg", links: [["mes.fm", "https://mes.fm/hyperliquid-flagged-address"]] },
    ],
  },
];

export const IMPORTANT_LINKS_HTML = `<ul>
<li><a href="https://peakd.com/hive-181335/@mes/tdvxnmej">Hive Overview and How to Sign Up</a></li>
<li><a href="https://www.youtube.com/playlist?list=PLai3U8-WIK0Fgp_lR0a0rscxWYrHARtkN">Blockchain Tutorials</a></li>
<li style="margin-left: 20px;">The Big Picture: <a href="https://peakd.com/general/@mes/blockchain-the-big-picture-part-1-what-do-you-own">Part 1</a> - <a href="https://peakd.com/general/@mes/blockchain-the-big-picture-part-2-tokenization">Part 2</a></li>
<li style="margin-left: 20px;"><a href="https://mes.fm/blockchain-playlist">mes.fm/blockchain</a></li>
<li><a href="https://mes.fm/impermanent-loss-calculator">Impermanent Loss Calculator</a></li>
<li style="margin-left: 20px;"><a href="https://1drv.ms/x/s!As32ynv0LoaIisMDKnAmCMwfUFzs6w">Excel spreadsheet</a></li>
<li><a href="https://mes.fm/portfolio">Crypto Portfolio &amp; Gains Tracker</a></li>
<li>Hive Dapps</li>
<li style="margin-left: 20px;"><a href="https://whosaidwhat.snapie.io/">WhoSaidWhat</a></li>
<li style="margin-left: 20px;"><a href="https://mywalletshistory.vercel.app/">Hive Wallet History (Tax helper tool)</a></li>
</ul>
`;
