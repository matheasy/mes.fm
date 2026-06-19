<?php

$hostname = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "memesdb";

$usertable = "memes_ic";

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


$sql = $type ? "UPDATE $usertable SET title='$title',description='$desc',uploadtype='$type' WHERE id='$id'" : "UPDATE $usertable SET title='$title',description='$desc' WHERE id='$id'";

if (!mysqli_query($con,$sql)) {
  die('Error: ' . mysqli_error($con));
}
echo "Success!";
mysqli_close($con);
?>