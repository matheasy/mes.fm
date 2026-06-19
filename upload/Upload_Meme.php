<!DOCTYPE html>

<html>
	<head>
		<script src="//ajax.googleapis.com/ajax/libs/jquery/1.11.0/jquery.min.js"></script>
		<style>
		.table {border: 1px solid black;margin-bottom: 0.5em;}
		.td {border: 1px solid black;padding:0.5em;height:100%;}
		.input {width:40em; height:2em;border:none;font-size: 1em;}
		.input--image {font-size: 1em;}
		.input--submit {width:10em;font-size: 1.1em;}
		.select {font-size: 1em;}
		.hide {display: none;}
		</style>
	</head>
	<body>

		<form action="Dont_Touch/Create_Meme.php" method="post" enctype="multipart/form-data">
			<table class="table">
				<tr>
					<td class="td"><label for="file">Image</label></td>
					<td class="td"><input class="input--image" type="file" name="file" id="file" size="334" required></td>
				</tr>
				<tr>
					<td class="td">Website</td>
					<td class="td">
						<select class="select" name="calc" id="calc">
							<option value="1">Grade Calculator</option>
							<option value="2">BMI Calculator</option>
							<option value="3">Percentage Calculator</option>
							<option value="4">Timer</option>
							<option value="5">Mortgage Calculator</option>
							<option value="6">Math Easy Solutions</option>
							<option value="7">Inflation Calculator</option>
							<option value="8">YouTube Calculator</option>
						</select>
					</td>
				</tr>
				<tr>
					<td class="td">Title</td>
					<td class="td"><input class="input" type="text" name="title" placeholder="Hamster Getting Infinite Haircuts" required></td>
				</tr>
				<tr>
					<td class="td">Description</td>
					<td class="td"><textarea class="input--desc" rows='4' cols='100%' name="desc" placeholder="How many haircuts does he need to be happy?" required></textarea></td>
				</tr>
				<tr id = "uploadType" class="hide">
					<td class="td">Upload Type</td>
					<td class="td">
						<select class="select" name="uploadType" id="uploadTypeValue">
							<option value="1">Meme</option>
							<option value="2" selected>Interesting Fact</option>
						</select>
					</td>
				</tr>
				<tr class="swag hide">
					<td class="td">Image (SOLUTION)</td>
					<td class="td"><input class="input--image required" type="file" name="file2" id="file2" size="334" required></td>
				</tr>
				<tr class="swag hide">
					<td class="td">Description (SOLUTION)</td>
					<td class="td"><textarea class="input--desc required" rows='4' cols='100%' name="desc2" placeholder="How many haircuts does he need to be happy?" required></textarea></td>
				</tr>
			</table>
			<input class="input--submit" type="submit">
		</form>

		<script>



		document.getElementById("calc").onchange = function() {
			localStorage.setItem('calc', document.getElementById("calc").value);
			if(document.getElementById("calc").value == 3) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Interesting Fact";
			} else if(document.getElementById("calc").value == 2) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Health Tip";
			} else if(document.getElementById("calc").value == 1) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Study Tip";
			} else if(document.getElementById("calc").value == 6) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Puzzle";
			} else {
				document.getElementById("uploadType").className = "hide";
			}

			if($("#uploadTypeValue").find('option:selected').text() == "Puzzle")
				$('.swag').removeClass("hide");
			else
				$('.swag').addClass("hide");

			$('.required').prop('required', function(){
			   return  $(this).is(':visible');
			});
				
		}

		if (localStorage.getItem('calc')) {
		    document.getElementById("calc").options[Number(localStorage.getItem('calc'))-1].selected = true;
		    if(document.getElementById("calc").value == 3) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Interesting Fact";
			} else if(document.getElementById("calc").value == 2) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Health Tip";
			} else if(document.getElementById("calc").value == 1) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Study Tip";
			} else if(document.getElementById("calc").value == 6) {
				document.getElementById("uploadType").className = "";
				document.getElementById("uploadTypeValue").options[1].text = "Puzzle";
			} else {
				document.getElementById("uploadType").className = "hide";
			}
		}

		document.getElementById("uploadTypeValue").onchange = function() {
			localStorage.setItem('uploadTypeValue', document.getElementById("uploadTypeValue").value);	
		}

		if (localStorage.getItem('uploadTypeValue')) {
		    document.getElementById("uploadTypeValue").options[Number(localStorage.getItem('uploadTypeValue'))-1].selected = true;
		}

		$("#uploadTypeValue").change(function() {

			if($(this).find('option:selected').text() == "Puzzle")
				$('.swag').removeClass("hide");
			else
				$('.swag').addClass("hide");

			$('.required').prop('required', function(){
				return  $(this).is(':visible');
			});

		});

		if($("#uploadTypeValue").find('option:selected').text() == "Puzzle")
				$('.swag').removeClass("hide");
			else
				$('.swag').addClass("hide");

			$('.required').prop('required', function(){
			   return  $(this).is(':visible');
			});

		</script>

	</body>
</html>