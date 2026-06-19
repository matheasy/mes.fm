<?php

$hostname = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "inflationdb";
$source = $_GET['source'];

$con=mysqli_connect($hostname,$username,$password,$dbname);
// Check connection
if (mysqli_connect_errno()) {
  echo "Failed to connect to MySQL: " . mysqli_connect_error();
}

$sql = "SELECT DISTINCT(country) FROM countrydata WHERE source = '$source' AND cpi != 0";
$result = mysqli_query($con,$sql);
if (!$result) {
  die('Error: ' . mysqli_error($con));
}

while($row = mysqli_fetch_array($result)) {
	echo '<option value="'.$row['country'].'">'.$row['country'].'</option>';
}

if (!mysqli_query($con,$sql)) {
  die('Error: ' . mysqli_error($con));
}

mysqli_close($con);
?>