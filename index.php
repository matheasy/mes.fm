<?php
$whitelist = array('127.0.0.1','::1');
$localhost = in_array($_SERVER['REMOTE_ADDR'], $whitelist) ? true : false;
require_once $localhost ? '../vendor/autoload.php' : 'vendor/autoload.php';
require_once $localhost ? '../main_lib/Mobile_Detect.php' : 'main_lib/Mobile_Detect.php';
require_once 'global_variables_extension.php';

if( isset($_GET['mobile']) )
    $mobile = $_GET['mobile'];
else {
    $detect = new Mobile_Detect;
    $mobile = ( $detect->isMobile() && !$detect->isTablet() ) ? true : false;
}

//$uri = $_SERVER['REQUEST_URI'];
$foldersToSearch = $localhost ? array('../main_templates','templates','../main_css') : array('main_templates','templates','main_css');
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
		echo $twig->render('home_page.twig', array(
			'gplus_author' => 'https://plus.google.com/+MathEasySolutionsPage',
			'page_description' => 'The one stop for video tutorials, funny math memes, useful calculators and all things math.'
		));
		break;
	case '/pipmypet':
		echo $twig->render('pipmypet.twig', array(
			'show_ads' => false
		));
		break;
    case '/puzzles': //puzzles
        $localhost ? require_once '../main_lib/memes_lib.php' : require_once $_SERVER['DOCUMENT_ROOT'].'/main_lib/memes_lib.php';
        $mes_memes = new MES_Memes('memes');

        $pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

        $all_data = $mes_memes->all_meme_data($pageNumber,$type=2);
        $data = $all_data[0];
        $num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'memes_dir' => 'puzzles',
            'subscribe_data_option_2' => 'Puzzles',
            'og_description' => 'Check out Math Easy Solutions\' Puzzles and Riddles!',
            'title' => 'Puzzles',
            'page_title' => $data ? 'MES Puzzles' : 'No puzzles to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Only the finest puzzles and riddles.',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2'
        )); 
        break;

    case strpos($uri, '/solution') !== false: //puzzles solution single page
        $localhost ? require_once '../main_lib/memes_lib.php' : require_once $_SERVER['DOCUMENT_ROOT'].'/main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes');

        $url = explode('/puzzles/', $uri);
        $url = $url[1];
        $url = explode('/solution', $url);
        $url = $url[0];

        $all_data = $mes_meme->single_meme_data($url,$type=2);
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
            'memes_dir' => 'puzzles',
            'subscribe_data_option_2' => 'Puzzles',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://mes.fm/img/memes/".$current_meme['imgurl_sol'],
            'title' => $current_meme['title'].' (SOLUTION) | Puzzles',
            'page_title' => $current_meme['title'].' (SOLUTION)',
            'page_description' => $current_meme['description_sol'].'<br><br>Check out the puzzle (without the solution) by clicking <a class="link" href="puzzles/'.$url.'">here</a>!',
            'img_url' => $current_meme['imgurl_sol'],
            'next_meme' => $next_meme ? $next_meme.'/solution':false,
            'prev_meme' => $prev_meme ? $prev_meme.'/solution':false,
            'rand_meme' => $rand_meme.'/solution',
            'current_tab' => '2'
        )); 
        break;


    case strpos($uri, '/puzzles/'): //puzzles single page
        $localhost ? require_once '../main_lib/memes_lib.php' : require_once $_SERVER['DOCUMENT_ROOT'].'/main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes');

        $url = explode('puzzles/', $uri);
        $url = $url[1];
        $all_data = $mes_meme->single_meme_data($url,$type=2);
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
            'memes_dir' => 'puzzles',
            'subscribe_data_option_2' => 'Puzzles',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Puzzles',
            'page_title' => $current_meme['title'],
            'page_description' => $current_meme['description'].'<br><br>Check out the solution to this puzzle by clicking <a class="link" href="puzzles/'.$url.'/solution">here</a>!',
            'img_url' => $current_meme['imgurl'],
            'img_id' => $current_meme['id'],
            'next_meme' => $next_meme,
            'prev_meme' => $prev_meme,
            'rand_meme' => $rand_meme,
            'current_tab' => '2'
        )); 
        break;
	case '/memes': //memes
		require_once $localhost ? '../main_lib/memes_lib.php' : 'main_lib/memes_lib.php';
		$mes_memes = new MES_Memes('memes');

		$pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

		$all_data = $mes_memes->all_meme_data($pageNumber,$type=1);
		$data = $all_data[0];
		$num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'subscribe_data_option_2' => 'Math Memes',
            'og_description' => 'Check out Math Easy Solutions\' Memes!',
            'title' => 'Memes',
            'page_title' => $data ? 'Memes' : 'No memes to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Hilarious school related memes.',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '3'
        )); 
		break;
	case strpos($uri, '/memes/'): //memes single page
		require_once $localhost ? '../main_lib/memes_lib.php' : 'main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes');

		$url = explode('memes/', $uri);
		$url = $url[1];
		$all_data = $mes_meme->single_meme_data($url,$type=1);
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
            'subscribe_data_option_2' => 'Math Memes',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Memes',
            'page_title' => $current_meme['title'],
            'page_description' => $current_meme['description'],
            'img_url' => $current_meme['imgurl'],
            'img_id' => $current_meme['id'],
            'next_meme' => $next_meme,
            'prev_meme' => $prev_meme,
            'rand_meme' => $rand_meme,
            'current_tab' => '3'
        )); 
		break;
	case '/calculators': //calculators
        echo $twig->render('calculators.twig', array(
        	'og_description' => 'Check out the many useful online calculators brought to you by Math Easy Solutions!',
            'title' => 'Calculators',
            'page_title' => 'Calculators',
            'page_description' =>'Free online calculators for all your needs.',
            'current_tab' => '5',
            'show_ads' => false,
            'side_media_net' => true
        )); 
		break;
	case '/tools': //tools
        echo $twig->render('tools.twig', array(
        	'og_description' => 'Check out the useful online tools brought to you by Math Easy Solutions!',
            'title' => 'Tools',
            'page_title' => 'Tools',
            'page_description' =>'Free online tools for all your needs.',
            'current_tab' => '6',
        )); 
		break;
	case '/mobile-apps': //mobile apps
        echo $twig->render('mobile-apps.twig', array(
        	'og_description' => 'Check out the mobile apps by Math Easy Solutions',
            'title' => 'Mobile Apps',
            'page_title' => 'Mobile Apps',
            'page_description' =>'Mobile Apps built by Math Easy Solutions.',
            'current_tab' => '7',
        )); 
		break;
	case '/partners': //partners
        echo $twig->render('partners.twig', array(
        	'og_description' => 'Check out the partners of Math Easy Solutions',
            'title' => 'Partners',
            'page_title' => 'Partners',
            'page_description' =>'Partners of Math Easy Solutions.',
            'current_tab' => '8',
        )); 
		break;
    case '/speedread': //test
        echo $twig->render('speedread.twig'); 
        break;
    case '/donate': //donate
        echo $twig->render('donate.twig', array(
            'og_description' => 'Help keep MES running and providing breakthrough research by donating!',
            'title' => 'Donate',
            'page_title' => 'Support Math Easy Solutions!',
            'page_description' =>'Help keep MES running and providing breakthrough research by donating!',
            'show_ads' => false,
        )); 
        break;
    case '/crypto-referrals': //crypto referrals
        echo $twig->render('crypto-referrals.twig', array(
            'og_description' => 'Get a referral bonus for the both of us by using the following links!',
            'title' => 'Cryptocurrency Referral Links',
            'page_title' => 'Cryptocurrency Referral Links',
            'page_description' =>'Get a referral bonus for the both of us by using the following links!',
            'show_ads' => false,
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
    case '/nano':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://shop.ledger.com/pages/ledger-nano-x?r=7d5787f5fd32");
        break;
    case '/somewhere':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://gofund.me/a3dae599");
        break;
    case '/pg-bitchute':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.bitchute.com/playlist/yAGW0yVvL43h/");
        break;
    case '/experiments-bitchute':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.bitchute.com/playlist/7h7fyXU7M2eB/");
        break;
    case '/911truth-bitchute':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.bitchute.com/playlist/MSsLsRJrMPJt/");
        break;
    case '/hutchison':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://drive.google.com/drive/folders/1_F1gU5ir6U7QebvXPKWxJiT0hLXgHK8j");
        break;
    case '/meshutchison':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/f/s!As32ynv0LoaIitNiabk7uQmmdV5UJg");
        break;
    case '/hutchison-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0GlfVj5AYNtbF688pr8fk9X");
        break;
    case '/tlbnawki':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://drive.google.com/drive/folders/1vzfDkOFwJtuuSS7gZAFGq_e2gaCMlgiF");
        break;
    case '/store':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://teespring.com/stores/mes-store");
        break;
    case '/truth':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/@mestruth");
        break;
    case '/subscribe':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://matheasy.substack.com/");
        break;
    case '/hashtag-ios':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://itunes.apple.com/ca/app/hashtag-everything-lite/id739573482");
        break;
    case '/hashtag-ios-plus':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://itunes.apple.com/ca/app/hashtag-everything/id733449119");
        break;
    case '/hashtag-android':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://play.google.com/store/apps/details?id=com.mike.HashtagEverythingLite");
        break;
    case '/hashtag-android-plus':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://play.google.com/store/apps/details?id=com.mike.HashtagEverything");
        break;
    case '/pizzagate':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/f/s!As32ynv0LoaIhthnOEvWhPJeVQlh7w");
        break;
    case '/pizzagate-voat':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://voat.co/v/pizzagate/1593888");
        break;
    case '/pizzagate-steemit':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://steemit.com/pizzagate/@mes/pizzagate-video-tutorial-series-on-youtube-easy-to-follow-and-fully-sourced");
        break;
    case '/pizzagate-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0EixsL8XC7xkfGi6Moxlk8Z");
        break;
    case '/pizzagate-videos':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/u/s!As32ynv0LoaIh6UQ7UY1QjSjhbZDXw?e=A6GpgM");
        break;
    case '/judywoodbook':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: http://wheredidthetowersgo.com/buy/");
        break;
    case '/911truth':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/f/s!As32ynv0LoaIhvJ2emGRcJ07wORKAw");
        break;
    case '/911truth-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0EzqTamtIXtgX8QudQSxuxh");
        break;
    case '/freeenergy':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/f/s!As32ynv0LoaIhvxz75CajpbMoyUzKA");
        break;
    case '/freeenergy-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0FKVpHL_onhaqBeVP-8qJXV");
        break;
    case '/moonlanding-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0GIlZkaJYnTiWrHfvVy9DkR");
        break;
    case '/occult-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0EX_SJASwVeZMA-CMgu6-Ox");
        break;
    case '/tengri137-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0HUv8mv9gzQc3Ej4csHIQb3");
        break;
    case '/milestones-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0GvSFoHzN8fvSUjru3C4Myk");
        break;
    case '/antigravity-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0HkT4DmvQSg0XZfY5Bxkxq1");
        break;
    case '/antigravity':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/f/s!As32ynv0LoaIh5c5_VSbt05w-H0flw");
        break;
    case '/speech-android':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://play.google.com/store/apps/details?id=com.naturalsoft.personalweb");
        break;
    case '/science-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0GhjCHmTw1XbqMD_EdVKdd9");
        break;
    case '/science':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/u/s!As32ynv0LoaIh_ZYG7AbhPTTQqUkYg?e=Cj1sCW");
        break;
    case '/todolist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://docs.google.com/document/d/1ZswTRX9aTpkeHfhX7NQX2KX3KAHUS85lahhHWN8_lpI/edit");
        break;
    case '/chatroom':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://discordapp.com/invite/A4cHxjP");
        break;
    case '/blockchain-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0Fgp_lR0a0rscxWYrHARtkN");
        break;
    case '/eyes':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://twitter.com/MathEasySolns/status/920827513592471552");
        break;
    case '/hands':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://twitter.com/MathEasySolns/status/1054947652071239680");
        break;
    case '/experiments':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/u/s!As32ynv0LoaIh6RmDgwVZknJxaSoVw?e=Cvf7jN");
        break;
    case '/experiments-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0HUHoank-Lj9q6RGAS51QRh");
        break;
    case '/experiments-draft':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0FfZ_7hUuyO7xN8lp5oaDiu");
        break;
    case '/911truth-videos':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://1drv.ms/u/s!As32ynv0LoaIh6USengFq-fY-nVmKQ?e=vIO31l");
        break;
    case '/911truth-odysee':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://odysee.com/$/playlist/a4981c9731bec068847fd370b593769304b0b181");
        break;
    case '/speech-extension':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://chrome.google.com/webstore/detail/read-aloud-a-text-to-spee/hdhinadidafjejdhmfkjgnolgimiaplp");
        break;
    case '/videospeed-extension':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://chrome.google.com/webstore/detail/video-speed-controller/nffaoalbilbmmfgbnbgppjihopabppdk");
        break;
    case '/volume-extension':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://chrome.google.com/webstore/detail/volume-booster/ejkiikneibegknkgimmihdpcbcedgmpo");
        break;
    case '/gplus':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://plus.google.com/+MathEasySolutionsPage");
        break;
    case '/linkedin':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.linkedin.com/company/math-easy-solutions");
        break;
    case '/physics-playlist':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.youtube.com/playlist?list=PLai3U8-WIK0EAUu0aAxoZmkS83RI65m1N");
        break;
    case '/antigravity-bitchute':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.bitchute.com/playlist/RNbuDQkqmSBB/");
        break;
    case strpos($uri, '/search-results'):
		echo $twig->render('search_results.twig', array(
			'title' => 'Search Results',
			'show_ads' => false,
		));
		break;
    case '/goldmoney':
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://www.goldmoney.com/r/sxFtqu");
        break;
	default: //page not found
		header('HTTP/1.0 404 Not Found');
		echo $twig->render('page_not_found.twig', array(
			'title' => 'Page Not Found'
		));
}

?>