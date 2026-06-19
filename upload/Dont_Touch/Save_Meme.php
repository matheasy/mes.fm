<?php

$hostname = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "memesdb";

if ($_POST['calc'] == 1) { //grade calculator
	$usertable = "memes_gc";
} else if ($_POST['calc'] == 2) { //bmi calculator
	$usertable = "memes_bmi";
} else if ($_POST['calc'] == 3) { //percentage calculator
	$usertable = "memes_pc";
} else if ($_POST['calc'] == 4) { //timer
	$usertable = "memes_timer";
} else if ($_POST['calc'] == 5) { //mortgage calculator
	$usertable = "memes_mc";
} else if ($_POST['calc'] == 6) { //mes
	$usertable = "memes";
} else if ($_POST['calc'] == 7) { //inflation calculator
	$usertable = "memes_ic";
} else if ($_POST['calc'] == 8) { //youtube calculator
	$usertable = "memes_yt";
}

$con=mysqli_connect($hostname,$username,$password,$dbname);
// Check connection
if (mysqli_connect_errno()) {
  echo "Failed to connect to MySQL: " . mysqli_connect_error();
}

// escape variables for security
$title = mysqli_real_escape_string($con, $_POST['title']);
$desc = mysqli_real_escape_string($con, $_POST['desc']);
$id = mysqli_real_escape_string($con, $_POST['id']);
$type = isset($_POST['type']) ? mysqli_real_escape_string($con, $_POST['type']) : 0;
$desc2 = isset($_POST['desc2']) ? mysqli_real_escape_string($con, $_POST['desc2']) : 0;


$sql = $type ? "UPDATE $usertable SET title='$title',description='$desc',uploadtype='$type' WHERE id='$id'" : "UPDATE $usertable SET title='$title',description='$desc' WHERE id='$id'";

if($type == 2 && $_POST['calc'] == 6)
	$sql = "UPDATE $usertable SET title='$title',description='$desc',description_sol='$desc2',uploadtype='$type' WHERE id='$id'";


if (!mysqli_query($con,$sql)) {
  die('Error: ' . mysqli_error($con));
}
echo "Success!";
mysqli_close($con);
?>