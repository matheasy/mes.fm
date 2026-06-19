<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="MES Curvature Calculator - Calculate how much Earth curves with distance.">
  <meta name="keywords" content="MES, Earth, Round Earth, Flat Earth, Earth's curvature, ball Earth, radius of Earth, 6371 km radius, 3958.8 mile radius">
  <meta name="author" content="Mathiew Estepho">
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <title>MES Earth Curvature Calculator</title>
  
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
    
        input, select, button, label {
          text-align: center;
          width: 40%; /* Adjust the width as needed */
          margin: 10px auto; /* Center the input field */
          max-width: 800px; /* Set a maximum width for desktop */
          font-size: 2em; /* Adjust the font size as needed */
          margin-bottom: 10px;
        }
        
        button {
      width: 30%; /* Adjust the width for the button */
         }    
    
        .calculator {
            text-align: center;
        }
    
      body {
        font-family: Arial, sans-serif;
        text-align: center;
        font-size: 1em;
        margin: 50px;
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

    <div class="calculator">
        <h1>MES Earth Curvature Calculator</h1>
        <label for="distance">Enter Distance:</label>
        <input type="number" id="distance" placeholder="Enter distance" value="22" oninput="calculateCurvature()" style="width: 200px;"">
        <select id="unit" oninput="calculateCurvature()" style="width: 100px;">
            <option value="km">km</option>
            <option value="miles">miles</option>
        </select>
        <p id="result"></p>
    </div>
    
<script>
    function calculateCurvature() {
        const distanceInput = document.getElementById('distance');
        const unitSelect = document.getElementById('unit');
        const resultElement = document.getElementById('result');
        
        const distance = parseFloat(distanceInput.value);
        const unit = unitSelect.value;

        if (isNaN(distance)) {
            resultElement.textContent = 'Please enter a valid distance.';
            return;
        }

        const R = unit === 'miles' ? 3958.8 : 6371; // Earth's mean radius in miles or km

        const curvature = (Math.pow(distance, 2)) / (2 * R);
        let curvatureMeters = curvature * 1000;

        if (unit === 'miles') {
            curvatureMeters /= 0.621371; // Convert meters to miles
        }

        resultElement.textContent = `The curvature is approximately ${curvatureMeters.toFixed(2)} meters (${(curvatureMeters * 3.28084).toFixed(2)} feet) for ${distance} ${unit}.`;
        resultElement.style.fontSize = '32px';
    }

    // Initial calculation on page load
    calculateCurvature();
</script>




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
        <p>&copy; 2023 Math Easy Solutions (MES). All rights reserved. | <a href="https://mes.fm/contact">Contact Us</a> | <a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
    </footer>

</body>
</html>
