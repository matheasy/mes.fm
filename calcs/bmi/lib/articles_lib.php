<?php

class BMI_Top_10 {

	private function connect() {
        $hostname = "23.229.186.102";
        $username = "mikecto";
        $password = "Ekim@123!";
        $dbname = "sportsbmidb";

		// Create connection
		$conn = new mysqli($hostname, $username, $password, $dbname);

		// Check connection
		if ($conn->connect_error) {
		    die("Connection failed: " . $conn->connect_error);
		} 
		//echo "Connected successfully";
		return $conn;
	}

	public function all_article_data ($uri) {
		$con = $this->connect();
		$sql = "SELECT url,title,img_url,img_alt,author,date_time FROM articles WHERE active=1 ORDER BY date_time DESC";
		$result = $con->query($sql);

	    // output data of each row
	    $result_array = array();
	    while($row = $result->fetch_assoc()) {
	        $result_array[] = $row;
	    }

		foreach ($result_array as $key => $field) {
			$date_time = $field['date_time'];
		    $visible_date = $this->date_time_to_visible($date_time);
		    $result_array[$key]['visible_date'] = $visible_date;
		    $result_array[$key]['url'] = 'https://bmicalculator.mes.fm'.$uri.'/'.$field['url']; //add 'sports/' before url
		    #$result_array[$key]['url'] = ltrim($uri,'/').'/'.$field['url']; //add 'sports/' before url
		}

	    //print_r($result_array);
	    return $result_array;
	}

	public function single_article_data ($url) {
		$con = $this->connect();
		$sql = "SELECT article_id,url,title,img_url,author,date_time FROM articles WHERE url='$url' AND active=1";
		$result = $con->query($sql);

		if ($result->num_rows > 0) {
		    // output data of each row
		    $result_array = array();
		    while($row = $result->fetch_assoc()) {
		        $result_array[] = $row;
		    }
		    $date_time = $result_array[0]['date_time'];
		    $visible_date = $this->date_time_to_visible($date_time);
		    $result_array[0]['visible_date'] = $visible_date;
		    return $result_array[0];
		} else {
			return false;
		}
	}

	public function date_time_to_visible($date_time) {
		return date("F d, Y", strtotime($date_time));
	}

	public function get_next_article ($id,$p) {
		if($p != 10)
			return false;
		$con = $this->connect();
		$id = $id - 1;
		$sql = "SELECT url,title FROM articles WHERE article_id='$id'";
		$result = $con->query($sql);
	    // output data of each row
	    $result_array = array();

		if ($result->num_rows > 0) {
		    // output data of each row
		    while($row = $result->fetch_assoc()) {
		    	$result_array[] = $row;
		    }
		    return $result_array[0];
		} else {
		    return false;
		}
	}

	public function athlete_data ($id,$p) {
		$con = $this->connect();
		$sql = "SELECT name,img_url,description,extra_stats,height_m,weight_kg FROM athletes WHERE article_id='$id' AND page='$p'";
		$result = $con->query($sql);
	    // output data of each row
	    $result_array = array();
	    while($row = $result->fetch_assoc()) {
	        $result_array[] = $row;
	    }
	    return $result_array[0];
	}	

	public function current_page ($p) {
		return ($p != 1) ? ' Page '.$p : '';
	}

	public function bmi ($m,$kg) {
		$bmi = ($kg/($m*$m));
		$total_inches = $m * 39.3701;
		$feet = intval($total_inches/12);
		$inches = $total_inches - ($feet*12);
		$pounds = $kg * 2.20462;
		switch(true)
			{
			  case $bmi < 18.5:
			    $category = 'Underweight';
			    break;
			  case $bmi >= 18.5 && $bmi <= 24.9:
			    $category = 'Normal Body Weight';
			    break;
			  case $bmi > 24.9 && $bmi <= 29.9:
			    $category = 'Overweight';
			    break;
			  case $bmi > 29.9:
			    $category = 'Obese';
			    break;
			}

		return array(
			'bmi'=>round($bmi,1),
			'category'=>$category,
			'feet'=>$feet,
			'inches'=>round($inches),
			'meters'=>$m,
			'pounds'=>round($pounds),
			'kg'=>$kg
			);
	}
}
?>