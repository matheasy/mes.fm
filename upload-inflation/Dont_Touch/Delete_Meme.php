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
$id = mysqli_real_escape_string($con, $_POST['id']);

$sql="DELETE FROM $usertable WHERE id='$id'";

if (!mysqli_query($con,$sql)) {
  die('Error: ' . mysqli_error($con));
}

mysqli_close($con);


$image = str_replace('-thumbnail-2','',$_POST['imgurl']);
$thumb = str_replace('-thumbnail-2','-thumbnail',$_POST['imgurl']);
$thumb2 = $_POST['imgurl'];

$ftp_server = "mes.fm";
$ftp_user_name = "mikecto@mes.fm";
$ftp_user_pass = "Ekim@123!";
$image_path = '/calcs/inflation/img/memes/'.$image;
$thumb_path = '/calcs/inflation/img/memes-thumbnail/'.$thumb;
$thumb_path_2 = '/calcs/inflation/img/memes-thumbnail/'.$thumb2;
$site_name = 'inflationcalculator.mes.fm';

// set up basic connection
$conn_id = ftp_connect($ftp_server);

// login with username and password
$login_result = ftp_login($conn_id, $ftp_user_name, $ftp_user_pass);

/*// check connection
if ((!$conn_id) || (!$login_result)) { 
    echo "<br>FTP connection has failed!<br>";
    echo "<br>Attempted to connect to $ftp_server."; 
    exit; 
} else {
    echo "<br>Connected to $ftp_server...<br>";
}*/

ftp_pasv($conn_id, true);

// delete the file
$delete = ftp_delete($conn_id, $image_path);
$delete = ftp_delete($conn_id, $thumb_path);
$delete = ftp_delete($conn_id, $thumb_path_2); 

// check upload status
if (!$delete) { 
	echo "Deleting Image has failed!";
} else {
	echo "Meme Deleted Successfully!\n\nDeleted $image and $thumb from $site_name";
}

// close the FTP stream 
ftp_close($conn_id);

?>