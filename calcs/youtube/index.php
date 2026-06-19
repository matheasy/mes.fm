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
			'gplus_author' => 'https://plus.google.com/+YoutubemoneyCoMES',
			'page_description' => 'How much do YouTubers make? This calculator estimates the
	        money that can be obtained from a YouTube video based on the number of views and
	        the RPM (Revenue per 1000 Impressions). If no RPM is inputted, the typical RPM
	        range from $1.36 to $3.40 will be used.'
		));
		break;
	case '/how-much-do-youtubers-make': //how-much-do-youtubers-make redirect to youtubers
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://youtubemoney.mes.fm/youtubers");
        exit();
        break;
    case strpos($uri, '/how-much-do-youtubers-make/'): //how-much-do-youtubers-make redirect to youtubers
        $id = explode('how-much-do-youtubers-make/', $uri);
        $id = $id[1];
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://youtubemoney.mes.fm/youtubers/".$id);
        exit();
        break;
	case '/youtubers': //youtube memes
		require_once '../../main_lib/memes_lib.php';
		$mes_memes = new MES_Memes('memes_yt');

		$pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

		$all_data = $mes_memes->all_meme_data($pageNumber);
		$data = $all_data[0];
		$num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
        	'memes_dir' => 'youtubers',
            'subscribe_data_option_2' => 'Info of YouTubers\' YouTube Revenues',
            'og_description' => 'Ever wonder how much money your favorite YouTubers, such as PewDiePie or Dude Perfect, make? Well it\'s a lot and you can browse through our gallery of just how much money the top YouTubers are racking in from just YouTube alone, and not to mention their many other endorsments!',
            'title' => 'How much do YouTubers make?',
            'page_title' => $data ? 'How much money do YouTubers make?' : 'Nothing to see here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Ever wonder how much money your favorite YouTubers, such as PewDiePie or Dude Perfect, make? Well it\'s a lot and you can browse through our gallery of just how much money the top YouTubers are racking in from just YouTube alone, and not to mention their many other endorsments!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2'
        )); 
		break;
	case strpos($uri, '/youtubers/'): //youtube memes single page
		require_once '../../main_lib/memes_lib.php';
		$mes_meme = new MES_Memes('memes_yt');

		$url = explode('youtubers/', $uri);
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
        	'memes_dir' => 'youtubers',
            'subscribe_data_option_2' => 'Info of YouTubers\' YouTube Revenues',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://youtubemoney.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | How much do YouTubers make?',
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
        )); 
        break;
	case '/privacy-policy': //privacy policy
		echo $twig->render('privacy_policy.twig', array(
			'title' => 'Privacy Policy',
			'page_title' => 'Privacy Policy',
		));
		break;
	case '/subscribe': //subscribe shortcut
        header("HTTP/1.1 301 Moved Permanently"); 
        header("https://matheasy.substack.com/");
        break;
	default: //page not found
		header('HTTP/1.0 404 Not Found');
		echo $twig->render('page_not_found.twig', array(
			'title' => 'Page Not Found'
		));
}

?>