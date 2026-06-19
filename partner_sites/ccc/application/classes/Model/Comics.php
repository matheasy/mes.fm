<?php defined('SYSPATH') or die('No direct script access.');
class Model_Comics extends Model
{	


    public function getLatestComic()
    {    

		$query = DB::select()->from('comics')->limit(1)->order_by('id','DESC');

		$result = $query->execute()->as_array();
		$result = $result[0];
      return $result;
    }

    public function getRandomComicUrl()
    {
    	$query = DB::select('Slug')->from('comics')->limit(1)->order_by(DB::expr('RAND()'));
    	$result = $query->execute()->as_array();
    	$result = $result[0];
    	return $result;
    }

    public function getNextComicUrl($current_date)
    {
    	$query = DB::select("Slug")->from("comics")->limit(1)->where("Id","<", $current_date)->order_by('Id','DESC');
    	$result = $query->execute()->as_array();
    			if (sizeof($result) == 0) {
    		return null;
    	}
    	$result = $result[0];
    	return $result;
    }

 	public function getPrevComicUrl($current_date)
    {
    	$query = DB::select("Slug")->from("comics")->limit(1)->where("Id",">", $current_date)->order_by('Id','ASC');
    	$result = $query->execute()->as_array();
    		if (sizeof($result) ==0) {
    		return null;
    	}
    	$result = $result[0];
    	return $result;
    }

    public function getFirstComicUrl()
    {
    	$query = DB::select("Slug")->from('comics')->limit(1)->order_by('Id','ASC');
    	$result = $query->execute()->as_array();
    	$result = $result[0];
    	return $result;
    }

    public function getLatestComicUrl()
    {
    	$query = DB::select("Slug")->from('comics')->limit(1)->order_by('Id','DESC');
    	$result = $query->execute()->as_array();
    	$result = $result[0];
    	return $result;
    }

    public function getComicBySlug($slug)
    {
    	$query = DB::select()->from("comics")->where("Slug","=",$slug);
    	$result = $query->execute()->as_array();
    	$result = $result[0];
    	return $result;
    }
}