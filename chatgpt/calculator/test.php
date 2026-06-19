<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remove Ads Example</title>
</head>
<body>
    <button onclick="removeAds()">Remove Ads</button>

    <div id="ads-container">
        <!-- Your original ad script goes here -->
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369" crossorigin="anonymous" id="ads-script"></script>
        <!-- Other ad-related content -->
    </div>

    <script>
        function removeAds() {
            const adsContainer = document.getElementById('ads-container');
            if (adsContainer) {
                adsContainer.innerHTML = '<p>Ads are removed.</p>'; // Replace with an alternative content or an empty div
            }
        }
    </script>
</body>
</html>
