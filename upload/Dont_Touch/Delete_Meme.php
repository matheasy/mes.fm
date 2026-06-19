<?php

$hostname = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "memesdb";

$calc = $_POST['calc'];

if ($calc == 1) { //grade calculator
	$usertable = "memes_gc";
} else if ($calc == 2) { //bmi calculator
	$usertable = "memes_bmi";
} else if ($calc == 3) { //percentage calculator
	$usertable = "memes_pc";
} else if ($calc == 4) { //timer
	$usertable = "memes_timer";
} else if ($calc == 5) { //mortgage calculator
	$usertable = "memes_mc";
} else if ($calc == 6) { //mes
	$usertable = "memes";
} else if ($calc == 7) { //inflation calculator
	$usertable = "memes_ic";
} else if ($calc == 8) { //youtube calculator
	$usertable = "memes_yt";
}

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
$solution = str_replace('thumbnail-2','solution',$_POST['imgurl']);
$solution_path = 0;

if ($calc == 1) { //grade
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/grade/img/memes/'.$image;
	$thumb_path = '/calcs/grade/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/grade/img/memes-thumbnail/'.$thumb2;
	$site_name = 'gradecalculator.mes.fm';
} else if ($calc == 2) { //bmi
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/bmi/img/memes/'.$image;
	$thumb_path = '/calcs/bmi/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/bmi/img/memes-thumbnail/'.$thumb2;
	$site_name = 'bmicalculator.mes.fm';
} else if ($calc == 3) { //percentage
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/percent/img/memes/'.$image;
	$thumb_path = '/calcs/percent/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/percent/img/memes-thumbnail/'.$thumb2;
	$site_name = 'percentagecalculator.mes.fm';
} else if ($calc == 4) { //timer
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/timer/img/memes/'.$image;
	$thumb_path = '/calcs/timer/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/timer/img/memes-thumbnail/'.$thumb2;
	$site_name = 'timer.mes.fm';
} else if ($calc == 5) { //mortgage
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/mortgage/img/memes/'.$image;
	$thumb_path = '/calcs/mortgage/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/mortgage/img/memes-thumbnail/'.$thumb2;
	$site_name = 'mortgagecalculator.mes.fm';
} else if ($calc == 6) { //mes
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/img/memes/'.$image;
	$thumb_path = '/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/img/memes-thumbnail/'.$thumb2;
	$solution_path = '/img/memes/'.$solution;
	$site_name = 'mes.fm';
} else if ($calc == 7) { //inflation
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/inflation/img/memes/'.$image;
	$thumb_path = '/calcs/inflation/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/inflation/img/memes-thumbnail/'.$thumb2;
	$site_name = 'inflationcalculator.mes.fm';
} else if ($calc == 8) { //youtube
	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$image_path = '/calcs/youtube/img/memes/'.$image;
	$thumb_path = '/calcs/youtube/img/memes-thumbnail/'.$thumb;
	$thumb_path_2 = '/calcs/youtube/img/memes-thumbnail/'.$thumb2;
	$site_name = 'youtubemoney.mes.fm';
}

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

if(file_exists($solution_path))
	$delete = ftp_delete($conn_id, $solution_path);


// check upload status
if (!$delete) { 
	echo "Deleting Image has failed!";
} else {
	echo "Meme Deleted Successfully!\n\nDeleted $image and $thumb from $site_name";
}

// close the FTP stream 
ftp_close($conn_id);

?>