<?php


if(trim($_POST['title']) == '' || trim($_POST['desc']) == '' || empty($_FILES['file']['name']))
	exit('Error. Make sure all textfields are filled and that there is an image attached.<br><br><a href="../Upload_Meme.php">Try Again</a>');

$urlname = $_POST['title'];

$urlname = strtolower($urlname);
$urlname = preg_replace('/[^ \w]+/', '', $urlname); //replace everything except blank space, letters, numbers with nothing
$urlname = str_replace(' ', '-', $urlname);

$ext = strtolower(pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION));

$imageFile = $_FILES['file']['tmp_name'];
$imageUrl = $urlname . '.' . $ext;
$thumbUrl = $urlname . '-thumbnail.' . $ext;

$thumbUrl2 = $urlname . '-thumbnail-2.' . $ext;

if(exif_imagetype($imageFile) == IMAGETYPE_JPEG){
    convertImageToThumb($imageFile,$thumbUrl,true,432,432);
    convertImageToThumb($imageFile,$thumbUrl2,true,161,161);
} else if (exif_imagetype($imageFile) == IMAGETYPE_PNG) {
    convertImageToThumb($imageFile,$thumbUrl,false,432,432);
    convertImageToThumb($imageFile,$thumbUrl2,false,161,161);
} else {
	exit('Must upload either PNG or JPEG/JPG images only.<br><br><a href="../Upload_Meme.php">Try Again</a>');
}

uploadImageToFTP($imageUrl,$thumbUrl,$thumbUrl2);

uploadImageToDatabase($imageUrl,$thumbUrl,$thumbUrl2,$urlname);

function convertImageToThumb ($imageFile,$thumbUrl,$jpeg,$w,$h) {
	
	// Content type
	//$jpeg ? header('Content-Type: image/jpeg') : header('Content-Type: image/png');

	// Get new sizes
	list($width, $height) = getimagesize($imageFile);
	$newwidth = $w;
	$newheight = $h;

	// Load
	$thumb = imagecreatetruecolor($newwidth, $newheight);
	$source = $jpeg ? imagecreatefromjpeg($imageFile) : imagecreatefrompng($imageFile);

	// Resize
	imagecopyresized($thumb, $source, 0, 0, 0, 0, $newwidth, $newheight, $width, $height);

	// Output
	$jpeg ? imagejpeg($thumb,'tmp/'.$thumbUrl) : imagepng($thumb,'tmp/'.$thumbUrl);

	//uploadImageToFTP($urlname,$thumbFileName);
}

function uploadImageToFTP ($image,$thumb,$thumb2) {

	$ftp_server = "mes.fm";
	$ftp_user_name = "mikecto@mes.fm";
	$ftp_user_pass = "Ekim@123!";
	$destination_file_image = '/calcs/inflation/img/memes/'.$image;
	$destination_file_thumb = '/calcs/inflation/img/memes-thumbnail/'.$thumb;
	$destination_file_thumb_2 = '/calcs/inflation/img/memes-thumbnail/'.$thumb2;
	$site_name = 'inflationcalculator.mes.fm';

	$source_file_image = $_FILES['file']['tmp_name'];
	$source_file_thumb = 'tmp/'.$thumb;
	$source_file_thumb_2 = 'tmp/'.$thumb2;

	// set up basic connection
	$conn_id = ftp_connect($ftp_server);
	

	// login with username and password
	$login_result = ftp_login($conn_id, $ftp_user_name, $ftp_user_pass);

	ftp_pasv($conn_id, true);

	/*// check connection
	if ((!$conn_id) || (!$login_result)) { 
	    echo "<br>FTP connection has failed!<br>";
	    echo "<br>Attempted to connect to $ftp_server."; 
	    exit; 
	} else {
	    echo "<br>Connected to $ftp_server...<br>";
	}*/

	//check if image already exists
	if(ftp_size($conn_id,$destination_file_image) > 0) {
		// close the FTP stream 
		ftp_close($conn_id);
		unlink($source_file_thumb);
		exit('<br>Meme title already exists. Please use a different title. <br><br><a href="../Upload_Meme.php">Try Again</a></br>');
	}

	// upload the file
	$upload = ftp_put($conn_id, $destination_file_image, $source_file_image, FTP_BINARY);
	$upload = ftp_put($conn_id, $destination_file_thumb, $source_file_thumb, FTP_BINARY);
	$upload = ftp_put($conn_id, $destination_file_thumb_2, $source_file_thumb_2, FTP_BINARY); 

	// check upload status
	if (!$upload) { 
		echo "<br>FTP upload has failed!";
	} else {
		echo "<br>Meme Uploaded Successfully!<br><br>Uploaded $image and $thumb to $site_name.<br>";
	}

	unlink($source_file_thumb);
	unlink($source_file_thumb_2);

	// close the FTP stream 
	ftp_close($conn_id);
}

function uploadImageToDatabase($imageUrl,$thumbUrl,$thumbUrl2,$urlname) {
    $hostname = "23.229.186.102";
    $username = "mikecto";
    $password = "Ekim@123!";
    $dbname = "memesdb";
	
	$con=mysqli_connect($hostname,$username,$password,$dbname);

	// Check connection
	if (mysqli_connect_errno()) {
	  echo "<br>Failed to connect to MySQL: " . mysqli_connect_error();
	}

	$usertable = "memes_ic";
	$site_name = 'inflationcalculator.mes.fm';

	// escape variables for security
	$title = mysqli_real_escape_string($con, $_POST['title']);
	$desc = mysqli_real_escape_string($con, nl2br($_POST['desc']));
	$imgurl = mysqli_real_escape_string($con, $imageUrl);
	$thumbnailurl = mysqli_real_escape_string($con, $thumbUrl);
	$thumbnailurl2 = mysqli_real_escape_string($con, $thumbUrl2);
	$urlname = mysqli_real_escape_string($con, $urlname);

	if(isset($type))
		$sql="INSERT INTO $usertable (date, title, description,imgurl,thumbnailurl,thumbnailurl2,urlname,uploadtype) VALUES (now(), '$title', '$desc', '$imgurl', '$thumbnailurl', '$thumbnailurl2', '$urlname', '$type')";
	else
		$sql="INSERT INTO $usertable (date, title, description,imgurl,thumbnailurl,thumbnailurl2,urlname) VALUES (now(), '$title', '$desc', '$imgurl', '$thumbnailurl', '$thumbnailurl2', '$urlname')";

	if (!mysqli_query($con,$sql)) {
	  die('Error: ' . mysqli_error($con));
	}

	echo '<br>Uploaded '.$_FILES['file']['name'].' to '.$site_name.' database.<br>';
	echo '<br><a href="https://inflationcalculator.mes.fm/money-facts/'.$urlname.'" target="_blank">View Money Fact Meme</a></br>';
	echo '<br><a href="../Upload_Meme.php">Upload Another Meme</a></br>';

	mysqli_close($con);
}

?>