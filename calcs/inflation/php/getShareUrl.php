<?php

$servername = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "sharecalcdb";
$usertable = $_GET['tableName'];

try {
	$conn = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
    $conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    // set the PDO error mode to exception
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // prepare sql and bind parameters
	$stmt = $conn->prepare("SELECT data FROM $usertable WHERE id = :id");
    $stmt->bindParam(':id', $_GET['id']);
	$stmt->execute();

    foreach ($stmt as $row) {
    	echo $row['data'];
    }
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}

$conn = null;

?>