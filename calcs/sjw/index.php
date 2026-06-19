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
			'gplus_author' => '',
			'page_description' => 'Being a SJW is tough work; let us do the heavy lifting.<br><br>Are we missing any phrases? <a class="link" href="https://sjwkeyboard.mes.fm/contact">Contact us</a> and let us know!'
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