// Content for mes.fm/crypto ("MES Crypto"), its Posts page mes.fm/crypto-posts and the Blockchain Tutorials page mes.fm/blockchain-tutorials (the YouTube playlist PLai3U8-WIK0Fgp_lR0a0rscxWYrHARtkN in playlist order, minus MES Livestream 72, which is the Livestreams tile -> /livestreams#blockchain). Hand-maintained; read by build.mjs.
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
  {
    id: "crypto-tutorials",
    title: "Blockchain Tutorials",
    standalone: [
      { href: "https://www.youtube.com/playlist?list=PLai3U8-WIK0Fgp_lR0a0rscxWYrHARtkN", title: "Blockchain Tutorials Playlist (YouTube)" },
    ],
    items: [
  { title: "Hive Cryptocurrency Overview and How to Sign Up", image: "https://i.ytimg.com/vi/ogxTNlTgyLU/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=ogxTNlTgyLU"], ["Hive", "https://peakd.com/hive-181335/@mes/tdvxnmej"]] },
  { title: "Ⓑ Blockchain: The Big Picture - Part 2: Tokenization", image: "https://i.ytimg.com/vi/_LgCufeCjFI/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=_LgCufeCjFI"], ["Hive", "https://peakd.com/general/@mes/blockchain-the-big-picture-part-2-tokenization"]] },
  { title: "Ⓑ Blockchain: The Big Picture - Part 1: What Do You Own?", image: "https://i.ytimg.com/vi/sEkip6F4Mv0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=sEkip6F4Mv0"], ["Hive", "https://peakd.com/general/@mes/blockchain-the-big-picture-part-1-what-do-you-own"]] },
  { title: "Create YouTube Summaries with an AI Agent on the Hive Blockchain in Seconds", image: "https://i.ytimg.com/vi/8VZBrgRL9KA/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=8VZBrgRL9KA"]] },
  { title: "Ⓑ Blockchain Overview: Bitcoin, Cryptocurrency, Cryptography, & Satoshi Nakamoto", image: "https://i.ytimg.com/vi/JaZRcA1Xut0/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=JaZRcA1Xut0"]] },
  { title: "🔧Custom Browser User Scripts: Unblock Brave Browser from Archive.is", image: "https://i.ytimg.com/vi/Va47UH2k-ww/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=Va47UH2k-ww"]] },
  { title: "Steemit Tutorial: Steem (STEEM), Steem Power (SP), and Steem Dollars (SMD) #GetOnSteem", image: "https://i.ytimg.com/vi/F5f1duDJG9Q/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=F5f1duDJG9Q"]] },
  { title: "Steemit: Overview: Social Media Platform on Steem Blockchain #GetOnSteem", image: "https://i.ytimg.com/vi/1RBzUDRScyQ/maxresdefault.jpg", links: [["YouTube", "https://www.youtube.com/watch?v=1RBzUDRScyQ"]] },
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
