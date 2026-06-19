<?php
$whitelist = array('127.0.0.1','::1');
$localhost = in_array($_SERVER['REMOTE_ADDR'], $whitelist) ? true : false;
require_once '../../vendor/autoload.php';
require_once '../../main_lib/Mobile_Detect.php';
require_once 'global_variables_extension.php';

if( isset($_GET['mobile']) )
    $mobile = $_GET['mobile'];
else {
    $detect = new Mobile_Detect;
    $mobile = ( $detect->isMobile() && !$detect->isTablet() ) ? true : false;
}

//$uri = $_SERVER['REQUEST_URI'];
$foldersToSearch = array('../../main_templates','templates','../../main_css');
$loader = new Twig_Loader_Filesystem($foldersToSearch);
$twig = new Twig_Environment($loader, array(
    'cache' => 'compilation_cache',
    'auto_reload' => true,
));

$uri = isset($_GET['uri']) ? '/'.rtrim($_GET['uri'], '/') : '/';
$global_variables = new Global_Variables_Extension($localhost,$mobile,$uri);
$twig->addExtension($global_variables);

switch($uri) {
	case '/': //homepage
		echo $twig->render('calculator.twig', array(
			'gplus_author' => '108768583229768838911',
			'page_description' => 'This is an online timer website that has a countdown timer, alarm clock, and stopwatch that also shows up in the browser tab!<br><br>
			This means that when you are working on your computer, you will always know what the timer is at just by looking at the browser tab, without having to view the webpage itself, thus saving you time!'
		));
		break;
	case '/inspirational-quotes': //memes
		require_once '../../main_lib/memes_lib.php';
		$mes_memes = new MES_Memes('memes_timer');

		$pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

		$all_data = $mes_memes->all_meme_data($pageNumber);
		$data = $all_data[0];
		$num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
        	'subscribe_data_option_2' => 'Inspirational Quotes',
            'og_description' => 'Check out Timer\'s Inspirational Quotes!',
            'title' => 'Inspirational Quotes',
            'page_title' => $data ? 'Inspirational Quotes' : 'No inspirational quotes to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Lift yourself up with these amazing inspirational, motivational, love, and awe-inspiring life quotes!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2'
        )); 
		break;
	case strpos($uri, '/inspirational-quotes/'): //memes single page
		require_once '../../main_lib/memes_lib.php';
		$mes_meme = new MES_Memes('memes_timer');

		$url = explode('inspirational-quotes/', $uri);
		$url = $url[1];
		$all_data = $mes_meme->single_meme_data($url);
		$current_meme = $all_data[0];
		$next_meme = $all_data[1];
		$prev_meme = $all_data[2];
		$rand_meme = $all_data[3];
		if(!$current_meme) {
            header('HTTP/1.0 404 Not Found');
            echo $twig->render('page_not_found.twig', array('title' => 'Page Not Found'));
            exit();
        }
        
		$twig->addFunction(new Twig_SimpleFunction('img_data', 'get_img_data'));
        echo $twig->render('memes_single.twig', array(
        	'subscribe_data_option_2' => 'Inspirational Quotes',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://timer.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Inspirational Quotes',
            'page_title' => $current_meme['title'],
            'page_description' => $current_meme['description'],
            'img_url' => $current_meme['imgurl'],
            'img_id' => $current_meme['id'],
            'next_meme' => $next_meme,
            'prev_meme' => $prev_meme,
            'rand_meme' => $rand_meme,
            'current_tab' => '2'
        )); 
		break;
	case '/contact': //contact
        echo $twig->render('contact.twig', array(
            'title' => 'Contact Us',
            'page_title' => 'Contact Us',
            'show_ads' => false
        )); 
        break;
	case '/privacy-policy': //privacy policy
		echo $twig->render('privacy_policy.twig', array(
			'title' => 'Privacy Policy',
			'page_title' => 'Privacy Policy',
            'show_ads' => false
		));
		break;
    case '/subscribe':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://matheasy.substack.com/");
        break;
    case strpos($uri, '/search-results'): //search results
		echo $twig->render('search_results.twig', array(
			'title' => 'Search Results',
			'show_ads' => false,
		));
		break;
	default: //page not found
		header('HTTP/1.0 404 Not Found');
		echo $twig->render('page_not_found.twig', array(
			'title' => 'Page Not Found'
		));
}

?>