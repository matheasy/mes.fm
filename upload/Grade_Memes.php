<!DOCTYPE html>

<html>
	<head>
		<script src="//ajax.googleapis.com/ajax/libs/jquery/1.11.0/jquery.min.js"></script>
		<style>
		#myTable, #myTable td, #myTable th {border:1px solid black;}
		#myTable {font-size:14px;border-collapse:collapse;}
		#myTable th {font-size: 1.5em; padding:0.5em;}
		#myTable td {width:120px;padding:0.5em;}
		#myTable .desc {width:100%;}
		#myTable img {display: block;width:120px;height:120px;}
		#myTable .save, #myTable .delete {font-size: 1.2em;}
		</style>
	</head>
<body>

	<p>GRADE CALCULATOR MEMES</p>

	<table id="myTable">
		<tr>
			<th>TITLE</th>
			<th>DESCRIPTION</th>
			<th>IMAGE</th>
			<th>IMG URL</th>
			<th>ID</th>
			<th>MEME LINK</th>
			<th>UPLOAD TYPE (1=memes, 2=study tips)</th>
		</tr>

		<?php

        $hostname = "23.229.186.102";
        $username = "mikecto";
        $password = "Ekim@123!";
        $dbname = "memesdb";
		$usertable = "memes_gc";

		$con=mysqli_connect($hostname,$username,$password,$dbname);

		// Check connection
		if (mysqli_connect_errno()) {
		  echo "Failed to connect to MySQL: " . mysqli_connect_error();
		}

		$sql = "SELECT title,description,thumbnailurl2,id,urlname,uploadtype FROM $usertable ORDER BY date DESC";
		$result = mysqli_query($con,$sql);
		if (!$result) {
		  die('Error: ' . mysqli_error($con));
		}

		while($row = mysqli_fetch_array($result)) {
		  echo '<tr><td><div contenteditable>'. 
		  $row['title'].'</div></td>'.
		  '<td><div contenteditable>'.$row['description'].'</div></td>'.
		  '<td><div><img src = "https://gradecalculator.mes.fm/img/memes-thumbnail/'.$row['thumbnailurl2'].'" /></td>'.
		  '<td>'.$row['thumbnailurl2'].'</td>'.
		  '<td>'.$row['id'].'</td>'.
		  '<td><a href="https://gradecalculator.mes.fm/'.($row['uploadtype']=='1'?'memes':'study-tips').'/'.$row['urlname'].'" target="_blank">https://gradecalculator.mes.fm/'.($row['uploadtype']=='1'?'memes':'study-tips').'/'.$row['urlname'].'</a></td>'.
		  '<td><div contenteditable>'.$row['uploadtype'].'</div></td>'.
		  '<td><button class = "save">Save</button></td>'.
		  '<td><button class = "delete">Delete</button></td></tr>';
		}

		mysqli_close($con);

		?>

	</table>

	<script>

		$('div[contenteditable]').keydown(function(e) {
		    // trap the return key being pressed
		    if (e.keyCode === 13) {
		      // insert 2 br tags (if only one br tag is inserted the cursor won't go to the next line)
		      document.execCommand('insertHTML', false, '<br><br>');
		      // prevent the default behaviour of return key pressed
		      return false;
		    }
		});

		$(".save").click(function() {

			var meme = $(this).closest('tr');
			var title = meme.find('td:eq(0)').text();
			var desc = meme.find('td:eq(1)').html();
			var id = meme.find('td:eq(4)').text();
			var type = meme.find('td:eq(6)').text();

			desc = desc.replace('<div contenteditable="">','');
			desc = desc.replace('</div>','');

			var makeChanges = confirm("Are you sure you want to make these changes?");
			if(makeChanges) {
				$.post('Dont_Touch/Save_Meme.php', { 
					title: title,
					desc: desc,
					id: id,
					type: type,
					calc: 1 //1 = gc, 2 = bmi, 3 = pc
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
					calc: 1 //1 = gc, 2 = bmi, 3 = pc
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