<?php

class MES_MEMES {

    public function __construct($usertable){
            $this->usertable = $usertable;
        }

    private function connect() {
        $hostname = "23.229.186.102";
        $username = "mikecto";
        $password = "Ekim@123!";
        $dbname = "memesdb";

        // Create connection
        $conn = new mysqli($hostname, $username, $password, $dbname);

        // Check connection
        if ($conn->connect_error) {
            die("Connection failed: " . $conn->connect_error);
        } 
        //echo "Connected successfully";
        return $conn;
    }

    public function all_meme_data ($pageNumber,$type=0) {
        $index = ($pageNumber - 1) * 20;
        $con = $this->connect();

        if($type)
            $sql = "SELECT SQL_CALC_FOUND_ROWS title,thumbnailurl,thumbnailurl2,urlname FROM $this->usertable WHERE uploadtype = $type ORDER BY date DESC LIMIT $index,20";
        else
            $sql = "SELECT SQL_CALC_FOUND_ROWS title,thumbnailurl,thumbnailurl2,urlname FROM $this->usertable ORDER BY date DESC LIMIT $index,20";

        $result = $con->query($sql);

        $sql2 = "SELECT FOUND_ROWS()";
        $result2 = $con->query($sql2);

        // output data of each row
        $result_array = array();
        while($row = $result->fetch_assoc()) {
            $result_array[] = $row;
        }

        // total number of memes
        $num_memes = array();
        while($row = $result2->fetch_assoc()) {
            $num_memes[] = $row;
        }

        $num_memes = $num_memes[0]['FOUND_ROWS()']; 

        $result_array = array($result_array,$num_memes);

        //print_r($result_array);
        return $result_array;
    }

    public function single_meme_data ($url,$type=0) {
        $con = $this->connect();

        //current meme data
        if($type)
            $sql = "SELECT * FROM $this->usertable WHERE urlname='$url' AND uploadtype = $type";
        else
            $sql = "SELECT * FROM $this->usertable WHERE urlname='$url'";

        $result = $con->query($sql);

        if ($result->num_rows > 0) {
            // output data of each row
            $result_array = array();
            while($row = $result->fetch_assoc()) {
                $result_array[] = $row;
            }
            $result_array = $result_array[0];
            $id = $result_array['id'];
        } else {
            return false;
        }

        $next_meme = $this->load_next_meme($id,$con,$type);
        $prev_meme = $this->load_prev_meme($id,$con,$type);
        $rand_meme = $this->load_rand_meme($con,$type);

        $result_array = array($result_array,$next_meme,$prev_meme,$rand_meme);
        //print_r($result_array);
        return $result_array;

    }

    public function load_next_meme ($id,$con,$type) {
        //next meme data
        if($type)
            $sql = "SELECT urlname FROM $this->usertable WHERE id = (select max(id) from $this->usertable where id < '$id' and uploadtype = $type)";
        else
            $sql = "SELECT urlname FROM $this->usertable WHERE id = (select max(id) from $this->usertable where id < '$id')";

        $result = $con->query($sql);

        if ($result->num_rows > 0) {
            // output data of each row
            $next_meme = array();
            while($row = $result->fetch_assoc()) {
                $next_meme[] = $row;
            }
            $next_meme = $next_meme[0]['urlname'];
        } else {
            $next_meme = 0;
        }

        return $next_meme;
    }

    public function load_prev_meme ($id,$con,$type) {
        //previous meme data
        if($type)
            $sql = "SELECT urlname FROM $this->usertable WHERE id = (select min(id) from $this->usertable where id > '$id' and uploadtype = $type)";
        else
            $sql = "SELECT urlname FROM $this->usertable WHERE id = (select min(id) from $this->usertable where id > '$id')";

        $result = $con->query($sql);

        if ($result->num_rows > 0) {
            // output data of each row
            $prev_meme = array();
            while($row = $result->fetch_assoc()) {
                $prev_meme[] = $row;
            }
            $prev_meme = $prev_meme[0]['urlname'];
        } else {
            $prev_meme = 0;
        }

        return $prev_meme;
    }

    public function load_rand_meme ($con,$type) {
        //random meme data
        if($type)
            $sql = "SELECT urlname FROM $this->usertable WHERE uploadtype = $type ORDER BY RAND() LIMIT 1";
        else
            $sql = "SELECT urlname FROM $this->usertable ORDER BY RAND() LIMIT 1";

        $result = $con->query($sql);

        $rand_meme = array();
        while($row = $result->fetch_assoc()) {
            $rand_meme[] = $row;
        }

        return $rand_meme[0]['urlname'];
    }

}
?>