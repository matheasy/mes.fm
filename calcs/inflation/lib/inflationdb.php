<?php

class Inflation_DB {

	private function connect() {
		$hostname = "23.229.186.102";
		$username = "mikecto";
		$password = "Ekim@123!";
		$dbname = "inflationdb";

		// Create connection
		$conn = new mysqli($hostname, $username, $password, $dbname);

		// Check connection
		if ($conn->connect_error) {
		    die("Connection failed: " . $conn->connect_error);
		} 
		//echo "Connected successfully";
		return $conn;
	}

	public function countries_list () {
		$con = $this->connect();
		$sql = "SELECT DISTINCT(country) FROM countrydata where cpi != 0";
		$result = $con->query($sql);

	    // output data of each row
	    $result_array = array();
	    while($row = $result->fetch_assoc()) {
	        $result_array[] = $row;
	    }

	    //print_r($result_array);
	    return $result_array;
	}
}
?>