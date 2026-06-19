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
		</style>
	</head>
<body>

	<p>YOUTUBE CALCULATOR MEMES</p>

	<table id="myTable">
		<tr>
			<th>TITLE</th>
			<th>DESCRIPTION</th>
			<th>IMAGE</th>
			<th>IMG URL</th>
			<th>ID</th>
			<th>MEME LINK</th>
		</tr>

		<?php

        $hostname = "23.229.186.102";
        $username = "mikecto";
        $password = "Ekim@123!";
        $dbname = "memesdb";
		$usertable = "memes_yt";

		$con=mysqli_connect($hostname,$username,$password,$dbname);

		// Check connection
		if (mysqli_connect_errno()) {
		  echo "Failed to connect to MySQL: " . mysqli_connect_error();
		}

		$sql = "SELECT title,description,thumbnailurl2,id,urlname FROM $usertable ORDER BY date DESC";
		$result = mysqli_query($con,$sql);
		if (!$result) {
		  die('Error: ' . mysqli_error($con));
		}

		while($row = mysqli_fetch_array($result)) {
		  echo '<tr><td><div contenteditable>'. 
		  $row['title'].'</div></td><td><div contenteditable>'.
		  $row['description'].'</div></td><td><div>'. 
		  '<img src = "https://youtubemoney.mes.fm/img/memes-thumbnail/'.$row['thumbnailurl2'].'" /></td>'.
		  '<td>'.$row['thumbnailurl2'].'</td>'.
		  '<td>'.$row['id'].'</td>'.
		  '<td><a href="https://youtubemoney.mes.fm/memes/'.$row['urlname'].'" target="_blank">https://youtubemoney.mes.fm/memes/'.$row['urlname'].'</a></td>'.
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
					calc: 8 //1 = gc, 2 = bmi, 3 = pc
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
					calc: 8 //1 = gc, 2 = bmi, 3 = pc
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