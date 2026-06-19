<?php

$hostname = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "inflationdb";
$country = $_GET['country'];
$source = $_GET['source'];

$con=mysqli_connect($hostname,$username,$password,$dbname);
// Check connection
if (mysqli_connect_errno()) {
  echo "Failed to connect to MySQL: " . mysqli_connect_error();
}

$sql = "SELECT cpi,year FROM countrydata WHERE country = '$country' AND source = '$source' ORDER BY year ASC";
$result = mysqli_query($con,$sql);
if (!$result) {
  die('Error: ' . mysqli_error($con));
}

while($row = mysqli_fetch_array($result)) {
	if ($row['cpi'])
  		echo '<option value="'.$row['cpi'].'">'.$row['year'].'</option>';
}

if (!mysqli_query($con,$sql)) {
  die('Error: ' . mysqli_error($con));
}

mysqli_close($con);
?>