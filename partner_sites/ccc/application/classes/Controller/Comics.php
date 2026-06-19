<?php defined('SYSPATH') or die('No direct script access.');

class Controller_Comics extends Controller_Base{

	 public function before()
    {
        
        parent::before();
        
	    $comic_slug = $this->request->param('comic_slug');
        
        $comicsModel  = new Model_Comics;
		$comic = (isset($comic_slug))? $comicsModel->getComicBySlug($comic_slug):$comicsModel->getLatestComic();

		$comic_url = $comic["Slug"]. "." .$comic["Image Type"];
		$comic_title = $comic["Title"];
		$comic_description = $comic["Description"];
		$comic_description = str_replace("_x000D_", "", $comic_description);
        $this->template->comic_title = $comic_title;
		$this->template->comic_description = $comic_description;
		$this->template->comic_url  = $comic_url;
		$this->template->comic_slug = $comic["Slug"];
    }

	public function action_index()
	{
		$comic_location = ($this->isDebug)? "/chinchatcomics/" :"/";
		$comicsModel  = new Model_Comics;
		$comic =  $comicsModel->getLatestComic();

		$randomUrl = $comicsModel->getRandomComicUrl();
		$randomUrl = $comic_location . $randomUrl["Slug"];

		$nextUrl = $comicsModel->getNextComicUrl($comic["id"]);
		$nextUrl = is_null($nextUrl)? "#": $comic_location .  $nextUrl['Slug'];
		$prevUrl = $comicsModel->getPrevComicUrl($comic["id"]);
		$prevUrl = is_null($prevUrl)? "#": $comic_location .  $prevUrl['Slug'] . '.png';
		
		$firstUrl = $comicsModel->getFirstComicUrl();
		$firstUrl = $comic_location . $firstUrl['Slug'];


		
		
		
		
		$view = new View("Main");
		$view->bind('comic_url', $this->template->comic_url)
		->bind('comic_title',$this->template->comic_title)
		->bind('comic_description',$this->template->comic_description)
		->bind('comic_random_url',$randomUrl)
		->bind('nextUrl',$nextUrl)
		->bind('firstUrl',$firstUrl);
		$this->template->content = $view;
	}

	public function action_archive()
	{

		$comic_location = ($this->isDebug)? "/chinchatcomics/" :"/";
		$comic_slug = $this->request->param('comic_slug');

		$comicsModel  = new Model_Comics;
		$comic = $comicsModel->getComicBySlug($comic_slug);

		$randomUrl = $comicsModel->getRandomComicUrl();

		$nextUrl = $comicsModel->getNextComicUrl($comic["id"]);
		$nextUrl = is_null($nextUrl)? "#": $comic_location .  $nextUrl['Slug'];
		$prevUrl = $comicsModel->getPrevComicUrl($comic["id"]);
		$prevUrl = is_null($prevUrl)? "#": $comic_location .  $prevUrl['Slug'];
		$latestUrl = $comicsModel->getLatestComicUrl();
		$firstUrl = $comicsModel->getFirstComicUrl();
		
		$comic_url = $comic["Slug"]. "." .$comic["Image Type"];
		$comic_title = $comic["Title"];
		$comic_description = $comic["Description"];
		$comic_description = str_replace("_x000D_", "<br />", $comic_description);
		
		$view = new View("Comic");
		$view->bind('comic_url', $comic_url)
		->bind('comic_title',$comic_title)
		->bind('comic_description',$comic_description)
		->bind('comic_random_url',$randomUrl['Slug'])
		->bind('nextUrl',$nextUrl)
		->bind('prevUrl',$prevUrl)
		->bind('firstUrl',$firstUrl['Slug'])
		->bind('latestUrl', $latestUrl['Slug']);
		$this->template->content = $view;

	}

} // End Comics
