<!DOCTYPE html>

<html>
	<head>
		<script src="//ajax.googleapis.com/ajax/libs/jquery/1.11.0/jquery.min.js"></script>
		<style>
		#myTable, #myTable td, #myTable th {border:1px solid black;}
		#myTable {font-size:14px;border-collapse:collapse;}
		#myTable th {font-size: 1.5em; padding:0.5em;}
		#myTable td {width:120px;padding:0.5em;}
		#myTable img {display: block;width:120px;height:120px;}
		#myTable .save, #myTable .delete {font-size: 1.2em;}
		.select {font-size: 1.2em;}
		</style>
	</head>
<body>

	<p>INFLATION DATA</p>
	<form action="Inflation_Data.php" method="post" enctype="multipart/form-data">
		<select class="select" name="country" id="country">
			<?php

			//Variables for connecting to your database.
			//These variable values come from your hosting account.
			$hostname = "inflationdb.db.6297265.hostedresource.com";
			$username = "inflationdb";
			$dbname = "inflationdb";

			//These variable values need to be changed by you before deploying
			$password = "Mathiew123!";

			$con=mysqli_connect($hostname,$username,$password,$dbname);

			// Check connection
			if (mysqli_connect_errno()) {
			  echo "Failed to connect to MySQL: " . mysqli_connect_error();
			}

			$sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'inflationdb'";
			$result = mysqli_query($con,$sql);
			if (!$result) {
			  die('Error: ' . mysqli_error($con));
			}

			while($row = mysqli_fetch_array($result)) {

				if($row[0] == $_POST['country'])
					echo '<option selected value="'.$row[0].'">'.$row[0].'</option>';
				else
					echo '<option value="'.$row[0].'">'.$row[0].'</option>';
			}

			mysqli_close($con);

			?>
		</select>
		<input type="submit">
	</form>

	<p>Showing Data for <span style="font-size:2em;font-weight:700"><?php echo strtoupper($_POST['country']); ?></span></p>

	<table id="myTable">
		<tr>
			<th>DATE</th>
			<th>VALUE</th>
		</tr>

		<?php

		//Variables for connecting to your database.
		//These variable values come from your hosting account.
		$hostname = "inflationdb.db.6297265.hostedresource.com";
		$username = "inflationdb";
		$dbname = "inflationdb";

		//These variable values need to be changed by you before deploying
		$password = "Mathiew123!";
		$usertable = $_POST['country'];

		$con=mysqli_connect($hostname,$username,$password,$dbname);

		// Check connection
		if (mysqli_connect_errno()) {
		  echo "Failed to connect to MySQL: " . mysqli_connect_error();
		}

		$sql = "SELECT date,value FROM $usertable ORDER BY date DESC";
		$result = mysqli_query($con,$sql);
		if (!$result) {
		  die('Error: ' . mysqli_error($con));
		}

		while($row = mysqli_fetch_array($result)) {
		  echo '<tr><td><div contenteditable>'. 
		  $row['date'].'</div></td><td><div contenteditable>'.
		  $row['value'].'</div></td>'. 
		  '<td><button class = "save">Save</button></td>'.
		  '<td><button class = "delete">Delete</button></td></tr>';
		}

		mysqli_close($con);

		?>

	</table>

	<script>
		$(".save").click(function() {

			var meme = $(this).closest('tr');
			var title = meme.find('td:eq(0)').text();
			var desc = meme.find('td:eq(1)').html();
			var id = meme.find('td:eq(4)').text();

			desc = desc.replace('<div contenteditable="">','');
			desc = desc.replace('</div>','');

			var makeChanges = confirm("Are you sure you want to make these changes?");
			if(makeChanges) {
				$.post('Dont_Touch/Save_Meme.php', { 
					title: title,
					desc: desc,
					id: id,
					calc: 3 //1 = gc, 2 = bmi, 3 = pc
				},
				success=function(data) {
					alert(data);
				}
				);
			}

		});

		$(".delete").click(function() {

			var meme = $(this).closest('tr');
			var imgurl = meme.find('td:eq(3)').text();
			var id = meme.find('td:eq(4)').text();
			var makeChanges = confirm("Are you sure you want to delete this meme?");
			if(makeChanges==true) {
				
				$.post('Dont_Touch/Delete_Meme.php', {
					imgurl: imgurl,
					id: id,
					calc: 3 //1 = gc, 2 = bmi, 3 = pc
				},

				success=function(data) {
					meme.remove();
					alert(data);
				}

				);
			}
			
		});
	</script>

</body>
</html>