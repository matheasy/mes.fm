<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="MES Gematria Calculator - Calculate sumerian, ordinal, and more gematria.">
  <meta name="keywords" content="MES, Gematria, Sumerian Gematria, Ordinal Gematria, Math Easy Solutions">
  <meta name="author" content="Mathiew Estepho">
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <title>MES Gematria Calculator</title>
  
  <style>
      h1 {
        text-align: center;
        font-size: 4em;
      }
    
      h2 {
        text-align: center;
        font-size: 2em;
      }
    
      @media screen and (max-width: 600px) {
        h1 {
          font-size: 2.5em; /* Adjust the font size for mobile */
        }
        h2 {
          font-size: 1.85em; /* Adjust the font size for mobile */
        }
        #wordInput {
          width: 100%; /* Full width on smaller screens */
          max-width: none; /* Remove the maximum width on smaller screens */
        }
      }
    
      #wordInput {
        text-align: center;
        width: 80%; /* Adjust the width as needed */
        margin: 10px auto; /* Center the input field */
        max-width: 800px; /* Set a maximum width for desktop */
        font-size: 2em; /* Adjust the font size as needed */
        margin-bottom: 10px;
      }
    
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        font-size: 1em;
        margin: 50px;
      }
    
      #result,
      #resultSumerian {
        font-size: 2em;
        margin-top: 20px;
      }
    </style>


    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369"
     crossorigin="anonymous"></script>
</head>
<body>

    <div style="text-align: center;">
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369"
                crossorigin="anonymous"></script>
        <!-- MES Links Square -->
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-1461238060884369"
             data-ad-slot="1197859571"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <script>
            (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
    </div>

<header>
    <h1>MES Gematria Calculator</h1>
</header>

<input style="text-align: center;" type="text" id="wordInput" placeholder="Type a word" oninput="updateGematriaResults()" value="gematria">

<h2>Ordinal Gematria</h2>

<div id="result">

    <script>

    function calculateCustomWordSum() {
        var word = document.getElementById('wordInput').value.toLowerCase(); // Convert to lowercase
        var wordSum = 0; // Reset wordSum for each calculation

        var customValues = {
            'a': 1,
            'b': 2,
            'c': 3,
            'd': 4,
            'e': 5,
            'f': 6,
            'g': 7,
            'h': 8,
            'i': 9,
            'j': 10,
            'k': 11,
            'l': 12,
            'm': 13,
            'n': 14,
            'o': 15,
            'p': 16,
            'q': 17,
            'r': 18,
            's': 19,
            't': 20,
            'u': 21,
            'v': 22,
            'w': 23,
            'x': 24,
            'y': 25,
            'z': 26
            // Add more letters and their custom values as needed
        };

        for (var i = 0; i < word.length; i++) {
            var letter = word.charAt(i);

            // Check if the letter is in the customValues object, use the custom value, or default to 0
            var letterValue = customValues.hasOwnProperty(letter) ? customValues[letter] : 0;

            wordSum += letterValue;
        }

        var resultElement = document.getElementById('result');
        resultElement.innerHTML = wordSum;

        // Return the calculated wordSum
        return wordSum;
    }

    function updateGematriaResults() {
        var wordSum = calculateCustomWordSum();
        document.getElementById('resultSumerian').innerHTML = wordSum * 6;
    }

    // Call the function on page load to show the calculations for the default value "gematria"
    calculateCustomWordSum();
    </script>
</div>

<!-- Another script can access the wordSum variable here -->

<h2>Sumerian Gematria</h2>
<div id="resultSumerian">
    <script>

        var wordSum = calculateCustomWordSum();
        document.getElementById('resultSumerian').innerHTML = wordSum * 6;

    </script>
</div>

    <h3><a href="https://1drv.ms/x/s!As32ynv0LoaIiKto0HBi5417FpcFqg">Excel Spreadsheet</a></h2>
    
    <h2><a href="https://mes.fm/links/">MES Links</a></h2>

<div style="clear: both;"></div>

    <div style="text-align: center; margin-top: 20px;">
    <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1461238060884369"
            crossorigin="anonymous"></script>
    <!-- MES Links Square -->
    <ins class="adsbygoogle"
         style="display:block"
         data-ad-client="ca-pub-1461238060884369"
         data-ad-slot="1197859571"
         data-ad-format="auto"
         data-full-width-responsive="true"></ins>
    <script>
        (adsbygoogle = window.adsbygoogle || []).push({});
    </script>
    </div>

    <footer>
        <p>&copy; 2026 Math Easy Solutions (MES). All rights reserved. | <a href="https://mes.fm/contact">Contact Us</a> | <a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
    </footer>

</body>
</html>
