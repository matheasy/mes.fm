<?php defined('SYSPATH') or die('No direct script access.');

class Controller_Base extends Controller_Template {

	public $template = 'Template';
	public $isDebug;

	public function before()
	{
		parent::before();
		$this->isDebug =  in_array( $_SERVER['REMOTE_ADDR'], array( '127.0.0.1', '::1' ) );
		$fb_link = $_SERVER['SERVER_NAME'];  "/archives/archive". $_SERVER['REQUEST_URI'];

	  	if ($this->auto_render)
  	    {
  	    	// Initialize empty values
  	    	$this->template->title   = '';
  	    	$this->template->meta    = '';
  			
  			$this->template->styles = array();
  			$this->template->scripts = array();      
  			$this->template->header = new View('Header');
  			$this->template->footer = new View ('Footer');
  	    }
	}
	
	public function after()
	{
        

		$styles = array(
				 	'media/css/skel-noscript.css' => 'screen',
				 	'media/css/style.css' => 'screen',
                    'media/css/style-desktop.css' => 'screen',
                    
                    //'media/css/ie8.css' => 'screen',
                   
                    //'media/css/style-1000px.css' => 'screen',
                    //'media/css/style-mobile.css' => 'screen',
					

                );

		$scripts = array(
				'media/js/jquery.min.js' => 'screen',
				'media/js/jquery.dropotron.min.js' => 'screen',
			);

		$this->template->styles = array_merge( $this->template->styles, $styles );
		$this->template->scripts = array_merge($this->template->scripts, $scripts);
	
		parent::after();

	}


	public function action_index()
	{
	
		

	}



} // End Welcome
