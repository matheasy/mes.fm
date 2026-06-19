<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="MES Impermanent Loss Calculator - Calculate impermanent loss and compare with holding 1 or both assests. .">
  <meta name="keywords" content="MES, cryptocurrency, crypto, bitcoin, impermanent loss, calculator, liquidty providing, blockchain, xrp, hive">
  <meta name="author" content="Mathiew Estepho">
  <link rel="icon" href="https://mes.fm/img/favicon.ico?v=1.0" type="image/x-icon" />
  <title>MES Impermanent Loss Calculator</title>
  
  <style>
      h1 {
        text-align: center;
        font-size: 2em;
      }
    
      h2 {
        text-align: center;
        font-size: 1.5em;
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
        font-size: 1.5em;
        margin: 50px;
      }
    
        table {
            border-collapse: collapse;
            width: 50%;
            margin: 20px auto;
        }
        table, th, td {
            border: 1px solid black;
            text-align: center;
        }
        th, td {
            padding: 10px;
            min-width: 150px;
        }
        .highlight {
            background-color: yellow;
        }
        
        input[type="number"] {
        font-size: 24px; /* Adjust the font size as needed */
        padding: 10px; /* Adds some padding inside the input box */
        width: 100%; /* Makes the input take the full width of its parent */\
        width: auto;
        box-sizing: border-box; /* Ensures padding doesn't affect the overall width */
        text-align:center;
            
        }
         
    .arrow-icon {
    font-size: 24px; /* Adjust the size to your preference */
    cursor: pointer;
    display: inline-block;
    vertical-align: middle;
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
    <h1>MES Impermanent Loss Calculator</h1>
</header>

        <div class="list-container">

    <h2 onclick="toggleList('inputs')">Inputs<span id="arrowIcon1" class="arrow-icon">&#9660;</span></h2>
    <table id="inputs">
        <tr>
            <th>Token</th>
            <th>Amount</th>
            <th>Price</th>
            <th class="highlight">Value</th>
            <th>New Price</th>
            <th class="highlight">% Change</th>
        </tr>
        <tr>
            <td>A</td>
            <td><input type="number" id="tokenAAmount" value="1000" step="any"></td>
            <td><input type="number" id="tokenAPrice" value="1.00" step="any"></td>
            <td><span id="tokenAValue"></span></td>
            <td><input type="number" id="tokenANewPrice" value="1.00" step="any"></td>
            <td><span id="tokenAChange"></span></td>
        </tr>
        <tr>
            <td>B</td>
            <td><span id="tokenBAmount"></span></td>
            <td><input type="number" id="tokenBPrice" value="1.00" step="any"></td>
            <td><span id="tokenBValue"></span></td>
            <td><input type="number" id="tokenBNewPrice" value="2.00" step="any"></td>
            <td><span id="tokenBChange"></span></td>
        </tr>
        <tr>
        <td></td>
        <td></td>
        <td class="highlight">Total</td>
        <td><span id="totalValue">0</span></td>
        </tr>

    </table>
    </div>


    <div class="list-container">

    <h2 onclick="toggleList('results')">Results<span id="arrowIcon1" class="arrow-icon">&#9660;</span></h2>
    <table id="results">

        <tr class="highlight">
            <th>Token</th>
            <th>Value if Held</th>
            <th>LP Amount</th>
            <th>LP Value</th>
            <th>Impermanent Loss (IL) of Providing Liquidity (LP)</th>
        </tr>
        <tr>
            <td>A</td>
            <td><span id="tokenAValueIfHeld"></span></td>
            <td><span id="tokenALPAmount2"></span></td>
            <td><span id="tokenALPValue"></span></td>
            <td rowspan = "2"><span id="impermanentLossPercent"></span></td>
        </tr>
        
        <tr>
            <td>B</td>
            <td><span id="tokenBValueIfHeld"></span></td>
            <td><span id="tokenBLPAmount2"></span></td>
            <td><span id="tokenBLPValue"></span></td>
        </tr>

        <tr>
            <td>Total</td>
            <td><span id="ValueIfHeld"></span></td>
            <td></td>
            <td><span id="LPValue"></span></td>
            <td><span id="impermanentLoss"></span></td>
        </tr>        
        

    </table>
    </div>
    
    <div class="list-container">

    <h2 onclick="toggleList('results2')">Additional Results<span id="arrowIcon1" class="arrow-icon">&#9660;</span></h2>
    <table id="results2">

        <tr class="highlight">
            <th>Token</th>
            <th>Value if Held ONLY</th>
            <th>IL of Holding Both</th>
            <th>IL of Providing LP</th>
            <th>IL of Holding Other Token ONLY</th>
        </tr>
        <tr>
            <td>A</td>
            <td><span id="tokenAValueOnly"></span></td>
            <td><span id="tokenAvsHoldingBothPercent"></span> (<span id="tokenAvsHoldingBoth"></span>)</td>
            <td><span id="tokenAvsLPpercent"></span> (<span id="tokenAvsLP"></span>)</span></td>
            <td><span id="tokenAvsBpercent"></span> (<span id="tokenAvsB"></span>)</span></td>
        </tr>
        
        <tr>
        <td>B</td>
        <td><span id="tokenBValueOnly"></span></td>
        <td><span id="tokenBvsHoldingBothPercent"></span> (<span id="tokenBvsHoldingBoth"></span>)</td>
        <td><span id="tokenBvsLPpercent"></span> (<span id="tokenBvsLP"></span>)</span></td>
        <td><span id="tokenBvsApercent"></span> (<span id="tokenBvsA"></span>)</span></td>
        </tr>
        
        

    </table>
    </div>
    
    <div class="list-container">

    <h2 onclick="toggleList('calculations')">LP Calculations<span id="arrowIcon1" class="arrow-icon">&#9660;</span></h2>
    <table id="calculations">
        <tr class="highlight">
            <th>k = A*B</th>
            <th>Price Ratio (PR) = B/A</th>
            <th>(kPR)^(1/2)</th>
            <th>(k/PR)^(1/2)</th>
            <th>k check</th>
        </tr>
        <tr>
            <td><span id="k"></span></td>
            <td><span id="priceRatio"></span></td>
            <td><span id="tokenALPAmount"></span></td>
            <td><span id="tokenBLPAmount"></span></td>
            <td><span id="kCheck"></span></td>
        </tr>

    </table>
    </div>

    <script>
    // Function to calculate values
    function calculate() {
        var tokenAAmount = parseFloat(document.getElementById('tokenAAmount').value);
        var tokenAPrice = parseFloat(document.getElementById('tokenAPrice').value);
        var tokenANewPrice = parseFloat(document.getElementById('tokenANewPrice').value);
        var tokenBPrice = parseFloat(document.getElementById('tokenBPrice').value);
        var tokenBNewPrice = parseFloat(document.getElementById('tokenBNewPrice').value);
    
        // Calculating values
        var tokenAValue = tokenAAmount * tokenAPrice;
        var tokenAChange = (tokenANewPrice - tokenAPrice) / tokenAPrice;
    	var tokenBAmount = tokenAValue / tokenBPrice;
        var tokenBValue = tokenBAmount * tokenBPrice;
        var tokenBChange = (tokenBNewPrice - tokenBPrice) / tokenBPrice;
        var totalValue = tokenAValue + tokenBValue;
        
        var k = tokenAAmount * tokenBAmount;
        var priceRatio = tokenBNewPrice / tokenANewPrice;
        var tokenALPAmount = Math.sqrt(k * priceRatio);
        var tokenALPAmount2 = tokenALPAmount;
        var tokenBLPAmount = Math.sqrt(k / priceRatio);
        var kCheck = tokenALPAmount * tokenBLPAmount;
        
        var tokenAValueIfHeld = tokenAAmount * tokenANewPrice;
        var tokenALPAmount2 = tokenALPAmount;
        var tokenALPValue = tokenALPAmount2*tokenANewPrice;
        var tokenBValueIfHeld = tokenBAmount * tokenBNewPrice;
        var tokenBLPAmount2 = tokenBLPAmount;
        var tokenBLPValue = tokenBLPAmount2*tokenBNewPrice;
        var ValueIfHeld = tokenAValueIfHeld + tokenBValueIfHeld;
        var LPValue = tokenALPValue + tokenBLPValue;
        var impermanentLoss = LPValue - ValueIfHeld;
        var impermanentLossPercent = impermanentLoss / ValueIfHeld;
        
        var tokenAValueOnly = tokenAValueIfHeld * 2;
        var tokenAvsHoldingBoth = ValueIfHeld - tokenAValueOnly;
        var tokenAvsHoldingBothPercent = tokenAvsHoldingBoth / tokenAValueOnly;
        var tokenBValueOnly = tokenBValueIfHeld * 2;
        var tokenBvsHoldingBoth = ValueIfHeld - tokenBValueOnly;
        var tokenBvsHoldingBothPercent = tokenBvsHoldingBoth / tokenBValueOnly;

        var tokenAvsLP = LPValue - tokenAValueOnly;
        var tokenAvsLPpercent = tokenAvsLP / tokenAValueOnly;
        var tokenBvsLP = LPValue - tokenBValueOnly;
        var tokenBvsLPpercent = tokenBvsLP / tokenBValueOnly;
        var tokenAvsB = tokenBValueOnly - tokenAValueOnly;
        var tokenAvsBpercent = tokenAvsB / tokenAValueOnly;
        var tokenBvsA = tokenAValueOnly - tokenBValueOnly;
        var tokenBvsApercent = tokenBvsA / tokenBValueOnly;
    
        // Displaying results
        document.getElementById('tokenAValue').innerText = '$' + tokenAValue.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenAChange').innerText = (tokenAChange * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        document.getElementById('tokenBAmount').innerText = tokenBAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenBValue').innerText = '$' + tokenBValue.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenBChange').innerText = (tokenBChange * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        document.getElementById('totalValue').innerText = '$' + totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('k').innerText = k.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('priceRatio').innerText = priceRatio.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenALPAmount').innerText = tokenALPAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenBLPAmount').innerText = tokenBLPAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('kCheck').innerText = kCheck.toLocaleString('en-US', { minimumFractionDigits: 2 });
        
        document.getElementById('tokenAValueIfHeld').innerText = '$' + tokenAValueIfHeld.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenALPAmount2').innerText = tokenALPAmount2.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenALPValue').innerText = '$' + tokenALPValue.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenBValueIfHeld').innerText = '$' + tokenBValueIfHeld.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenBLPAmount2').innerText = tokenBLPAmount2.toLocaleString('en-US', { minimumFractionDigits: 2 });
        document.getElementById('tokenBLPValue').innerText = '$' + tokenBLPValue.toLocaleString('en-US', { minimumFractionDigits: 2 });        
        document.getElementById('ValueIfHeld').innerText = '$' + ValueIfHeld.toLocaleString('en-US', { minimumFractionDigits: 2 });        
        document.getElementById('LPValue').innerText = '$' + LPValue.toLocaleString('en-US', { minimumFractionDigits: 2 });        
        document.getElementById('impermanentLoss').innerText = '$' + impermanentLoss.toLocaleString('en-US', { minimumFractionDigits: 2 });        
        document.getElementById('impermanentLossPercent').innerText = (impermanentLossPercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        
        document.getElementById('tokenAValueOnly').innerText = '$' + tokenAValueOnly.toLocaleString('en-US', { minimumFractionDigits: 2 });  
        document.getElementById('tokenAvsHoldingBoth').innerText = '$' + tokenAvsHoldingBoth.toLocaleString('en-US', { minimumFractionDigits: 2 }); 
        document.getElementById('tokenAvsHoldingBothPercent').innerText = (tokenAvsHoldingBothPercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        document.getElementById('tokenBValueOnly').innerText = '$' + tokenBValueOnly.toLocaleString('en-US', { minimumFractionDigits: 2 });  
        document.getElementById('tokenBvsHoldingBoth').innerText = '$' + tokenBvsHoldingBoth.toLocaleString('en-US', { minimumFractionDigits: 2 }); 
        document.getElementById('tokenBvsHoldingBothPercent').innerText = (tokenBvsHoldingBothPercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        
        document.getElementById('tokenAvsLP').innerText = '$' + tokenAvsLP.toLocaleString('en-US', { minimumFractionDigits: 2 }); 
        document.getElementById('tokenAvsLPpercent').innerText = (tokenAvsLPpercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        document.getElementById('tokenBvsLP').innerText = '$' + tokenBvsLP.toLocaleString('en-US', { minimumFractionDigits: 2 }); 
        document.getElementById('tokenBvsLPpercent').innerText = (tokenBvsLPpercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        document.getElementById('tokenAvsB').innerText = '$' + tokenAvsB.toLocaleString('en-US', { minimumFractionDigits: 2 }); 
        document.getElementById('tokenAvsBpercent').innerText = (tokenAvsBpercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';
        document.getElementById('tokenBvsA').innerText = '$' + tokenBvsA.toLocaleString('en-US', { minimumFractionDigits: 2 }); 
        document.getElementById('tokenBvsApercent').innerText = (tokenBvsApercent * 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '%';  
        
    }
    
    // Run calculate function every time an input changes
    document.addEventListener('DOMContentLoaded', function() {
        var inputs = document.querySelectorAll('input');
        inputs.forEach(function(input) {
            input.addEventListener('input', calculate);
        });
        calculate(); // Initial calculation with defaults
    });
    </script>

    <script>
        
function toggleList(id) {
    var element = document.getElementById(id);
    var arrowIcon = document.getElementById("arrowIcon1");

    if (element.style.display === "none") {
        element.style.display = ""; // Show table
        arrowIcon.innerHTML = "&#9660;"; // Down arrow (table shown)
    } else {
        element.style.display = "none"; // Hide table
        arrowIcon.innerHTML = "&#9650;"; // Up arrow (table hidden)
    }
}


    </script>

    <script>
        
        document.querySelectorAll("input[type='number']").forEach(input => {
            const initialWidth = input.offsetWidth; // Get the initial width of the input
        
            input.addEventListener('input', function() {
                this.style.width = Math.max(((this.value.length + 1) * 8), initialWidth) + 'px';
            });
        });

    </script>

    <a href="https://1drv.ms/x/s!As32ynv0LoaIisMDKnAmCMwfUFzs6w">Excel Spreadsheet Version</a>
    
    <br><br>
    
    <a href="https://chainbulletin.com/impermanent-loss-explained-with-examples-math">Constant Product Automated Market Maker</a>
    
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
        <p>&copy; 2024 Math Easy Solutions (MES). All rights reserved. | <a href="https://mes.fm/contact">Contact Us</a> | <a href="https://mes.fm/privacy-policy">Privacy Policy</a></p>
    </footer>

</body>
</html>
