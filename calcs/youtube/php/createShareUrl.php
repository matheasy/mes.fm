<?php

$servername = "23.229.186.102";
$username = "mikecto";
$password = "Ekim@123!";
$dbname = "sharecalcdb";
$usertable = $_POST['tableName'];

try {
	$conn = new PDO("mysql:host=$servername;dbname=$dbname", $username, $password);
    $conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    // set the PDO error mode to exception
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // prepare sql and bind parameters
    $stmt = $conn->prepare("INSERT INTO $usertable (id, data, date) VALUES (:id, :data, now())");
    $stmt->bindParam(':id', $id);
    $stmt->bindParam(':data', $data);

    // insert a row
    $id = substr(md5(uniqid(rand(), true)), 0, 12);
    $data = json_encode($_POST['data']);
    $stmt->execute();

    echo $_POST['site'].$id;
} catch (PDOException $e) {
    //echo "Error: " . $e->getMessage();
    echo 'Error: Please try again.';
}
$conn = null;

?>