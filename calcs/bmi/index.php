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
    //$mobile = false;
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
        echo $twig->render($mobile ? 'calculator_mobile.twig' : 'calculator.twig', array(
            'gplus_author' => 'https://plus.google.com/u/0/+BmiCalculatorCcPage',
            'bmi_home_above_comments' => true,
            'secondary_page_ads' => 0,
            'page_description' => 'This BMI calculator calculates your BMI (Body Mass Index) by entering your height and weight. The BMI is meant to give you a general idea of what your weight should be for your height.<br><br>The formula used to calculate BMI can be found here: <a class="link" href="bmi-formula">BMI Formula</a>.
            <br><br>Note that this index should only be used to give you a general idea of where body weight should be, so make sure to read the Important Notes below for more information.'
            ));
        break;
    case '/test': //just answer test page
        echo $twig->render('justanswer.twig');
        break;
    case '/test2': //media net test page
        echo $twig->render('medianet.twig');
        break;
    case '/memes/simple-healthy-avocado-salad': //redirect from memes to healthtips
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://bmicalculator.mes.fm/health-tips/simple-healthy-avocado-salad");
        exit();
        break;
    case '/memes': //memes
        require_once '../../main_lib/memes_lib.php';
        $mes_memes = new MES_Memes('memes_bmi');

        $pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

        $all_data = $mes_memes->all_meme_data($pageNumber,$type=1);
        $data = $all_data[0];
        $num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'secondary_page_ads' => 0,
            'subscribe_data_option_2' => 'BMI Memes',
            'og_description' => 'Check out BMI Calculator\'s Memes!',
            'title' => 'Memes',
            'page_title' => $data ? 'Memes' : 'No memes to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'The funniest and most accurate BMI Memes about Health and Fitness.',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '3'
        )); 
        break;
    case strpos($uri, '/memes/'): //memes single page
        require_once '../../main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes_bmi');

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
            'subscribe_data_option_2' => 'BMI Memes',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://bmicalculator.mes.fm/img/memes/".$current_meme['imgurl'],
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
    /*case '/e-book': //e-book
        echo $twig->render('e-book.twig', array(
            'hide_search' => true,
            'og_description' => 'Try out BMI Calculator\'s Healthy Breakfast E-Book by nutritionist, Kelly Walden, from Fresh Take Solutions!',
            'e_book_price' => '$7.95',
            'title' => 'Healthy Breakfast E-Book',
            'url' => 'https://bmicalculator.mes.fm/e-book/',
            'root_domain' => $localhost ? "" : "https://bmicalculator.mes.fm/",
            'social_media_url' => 'https://bmicalculator.mes.fm/e-book/',
            'og_img_url' => 'https://bmicalculator.mes.fm/img/power-balls.jpeg',
            'page_title' => 'Healthy Breakfast E-Book',
            'current_tab' => '8',
            'show_ads' => false,
            'in_image_ad' => false,
            'show_articles' => false
        ));
        break;
    case '/consultation': //consultation
        echo $twig->render('consultation.twig', array(
            'hide_search' => true,
            'og_description' => 'Try out BMI Calculator\'s Personalized Online Health Consultation by nutritionist, Kelly Walden, from Fresh Take Solutions!',
            'title' => 'Consultation',
            'url' => 'https://bmicalculator.mes.fm/consultation/',
            'social_media_url' => 'https://bmicalculator.mes.fm/consultation/',
            'root_domain' => $localhost ? "" : "https://bmicalculator.mes.fm/",
            'page_title' => 'Personalized Online Health Consultation',
            'current_tab' => '9',
            'show_ads' => false,
            'in_image_ad' => false,
            'show_articles' => false,
            'mobile' => false,
            'base' => 'base.twig'
        ));
        break;*/
    case '/social-media/instagram': //instagram
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://instagram.com/bmicalculator");
        exit();
        /*require_once 'lib/instagram_lib.php';
        $result = json_decode(fetchDataUsingCurl("https://api.instagram.com/v1/users/".$userid."/media/recent/?client_id=".$clientId),true);
        $twig->addFunction(new Twig_SimpleFunction('img_data', 'get_img_data'));

        echo $twig->render('instagram_gallery.twig', array(
            'og_description' => 'Check out BMI Calculator\'s Instagram Photos!',
            'title' => 'Instagram | Social Media',
            'page_title' => 'Instagram Photos via <a href="https://instagram.com/bmicalculator" target="_blank">@bmicalculator</a>',
            'current_tab' => '9',
            'results' => $result,
        ));*/
        break;
    case strpos($uri, '/social-media/instagram/'): //instagram single page
        $id = explode('instagram/', $uri);
        $id = $id[1];
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://instagram.com/p/".$id);
        exit();

        /*require_once 'lib/instagram_lib.php';
        $result = json_decode(fetchDataUsingCurl("https://api.instagram.com/publicapi/oembed/?url=https://instagram.com/p/".$id),true);
        $result_img = json_decode(fetchDataUsingCurl("https://noembed.com/embed?url=https://instagram.com/p/".$id),true);
        //echo print_r($result_img);

        if(!$result || $result["author_name"] != "bmicalculator") {echo $twig->render('page_not_found.twig', array('title' => 'Page Not Found'));exit();}
        //if(array_key_exists("error",$result)) {echo $twig->render('page_not_found.twig', array('title' => 'Page Not Found'));exit();}
        echo $twig->render('instagram_single.twig', array(
            'og_img_url' => 'https://bmicalculator.mes.fm/social-media/instagram/photos/'.$id.'.jpg',
            'og_description' => get_title($result),
            'title' => get_title($result).' | Instagram | Social Media',
            'page_title' => get_page_title($result),
            'current_tab' => '9',
            'insta_id' => $id,
            'data' => get_single_img_data($id,$result,$result_img),
        ));*/
        break;


    case '/health-tips': //health tips
        require_once '../../main_lib/memes_lib.php';
        $mes_memes = new MES_Memes('memes_bmi');

        $pageNumber = isset($_GET['p']) ? $_GET['p'] : 1;

        $all_data = $mes_memes->all_meme_data($pageNumber,$type=2);
        $data = $all_data[0];
        $num_memes = $all_data[1];

        echo $twig->render('memes_gallery.twig', array(
            'secondary_page_ads' => 0,
            'memes_dir' => "health-tips",
            'subscribe_data_option_2' => 'Health Tips',
            'og_description' => 'Check out BMI Calculator\'s amazing health tips and advice that are sure to help you be a healthier and more vibrant you!',
            'title' => 'Health Tips',
            'page_title' => $data ? 'Health Tips' : 'No health tips to show here! :(',
            'items_per_row' => $mobile ? 2 : 4,
            'page_description' => 'Check out these amazing health tips and advice that are sure to help you be a healthier and more vibrant you!',
            'data' => $data,
            'page' => $pageNumber,
            'max_page' => ceil($num_memes/20),
            'current_tab' => '2'
        )); 
        break;
    case strpos($uri, '/health-tips/'): //health tips single page
        require_once '../../main_lib/memes_lib.php';
        $mes_meme = new MES_Memes('memes_bmi');

        $url = explode('health-tips/', $uri);
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

        $desc = htmlspecialchars_decode($current_meme['description']);

        $desc = str_replace('<a ', '<a class="link" target="_blank" ', $desc);

        //$desc = preg_replace('@(https?://([-\w\.]+[-\w])+(:\d+)?(/([\w/_\.#-]*(\?\S+)?[^\.\s])?)?)@', '<a class="link" href="$1" target="_blank" rel="nofollow">$1</a>', $desc);

        $twig->addFunction(new Twig_SimpleFunction('img_data', 'get_img_data'));
        echo $twig->render('memes_single.twig', array(
            'memes_dir' => "health-tips",
            'subscribe_data_option_2' => 'Health Tips',
            'og_description' => $current_meme['description'],
            'og_img_url' => "https://bmicalculator.mes.fm/img/memes/".$current_meme['imgurl'],
            'title' => $current_meme['title'].' | Health Tips',
            'page_title' => $current_meme['title'],
            'page_description' => $desc,
            'img_url' => $current_meme['imgurl'],
            'img_id' => $current_meme['id'],
            'next_meme' => $next_meme,
            'prev_meme' => $prev_meme,
            'rand_meme' => $rand_meme,
            'current_tab' => '2'
        )); 
        break;

    case '/fitness': //fitness redirect to health-tips
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://bmicalculator.mes.fm/health-tips");
        exit();
        break;
    case strpos($uri, '/fitness/'): //fitness redirect to health-tips
        $id = explode('fitness/', $uri);
        $id = $id[1];
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://bmicalculator.mes.fm/health-tips/".$id);
        exit();
        break;

    case '/health-fitness': //health-fitness redirect to health-tips
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://bmicalculator.mes.fm/health-tips");
        exit();
        break;
    case strpos($uri, '/health-fitness/'): //health-fitness redirect to health-tips
        $id = explode('fitness/', $uri);
        $id = $id[1];
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://bmicalculator.mes.fm/health-tips/".$id);
        exit();
        break;


    case '/sports': //sports
        require_once 'lib/articles_lib.php';
        $bmi_article = new BMI_Top_10();
        echo $twig->render('articles_base.twig', array(
            'title' => 'Sports',
            'og_description' => 'Check out BMI Calculator\'s Sports Articles!',
            'page_title' => 'Sports',
            'current_tab' => '7',
            'articles_data' => $bmi_article->all_article_data($uri)
        ));
        break;
    case strpos($uri, '/sports/'): //sports single page
        require_once 'lib/articles_lib.php';
        $bmi_article = new BMI_Top_10();
        
        $p = isset($_GET['p']) ? $_GET['p'] : 1;
        $url = explode('sports/', $uri);
        $url = $url[1];

        $data = $bmi_article->single_article_data($url);
        if(!$data) {
            header('HTTP/1.0 404 Not Found');
            echo $twig->render('page_not_found.twig', array('title' => 'Page Not Found'));
            exit();
        }

        $athlete_data = $bmi_article->athlete_data($data['article_id'],$p);
        $next_data = $bmi_article->get_next_article($data['article_id'],$p);
        echo $twig->render('sports_articles.twig', array(
            'og_description' => 'Check out the '.$data['title'].' with BMI Calculator\'s sports article!',
            'og_img_url' => $data['img_url'],
            'title' => $data['title'].$bmi_article->current_page($p).' | Sports',
            'page_title' => $data['title'],
            'prev_page' => $p-1,
            'next_page' => $p+1,
            'current_tab' => '7',
            'author' => $data['author'],
            'date_time' => $data['date_time'],
            'visible_date' => $data['visible_date'],
            'p' => $p,        
            'next_article' => $next_data['title'],
            'next_article_url' => 'sports/'.$next_data['url'],
            'note' => 'Please note that BMI can be inaccurate for people who are fit or athletic
                        because their high muscle mass can list them as overweight, even
                        though their body fat percentages are relatively healthy. BMI
                        is intended to give a general sense of a healthy body weight.',
            'data' => array(
                    'name' => $athlete_data['name'],
                    'img_url' => $athlete_data['img_url'],
                    'description' => $athlete_data['description'],
                    'bmi' => $bmi_article->bmi($m=$athlete_data['height_m'],$kg=$athlete_data['weight_kg'])
                )
        ));
        break;
    case '/what-is-bmi': //body mass index
        header("HTTP/1.1 301 Moved Permanently"); 
        header("Location: https://bmicalculator.mes.fm/body-mass-index");
        exit();
        break;
    case '/body-mass-index': //body mass index
        echo $twig->render('bmi.twig', array(
            'og_description' => 'Learn what Body Mass Index really means!',
            'title' => 'Body Mass Index',
            'page_title' => 'Body Mass Index: Introduction and History to BMI',
            'current_tab' => '4'
        ));
        break;
    case '/bmi-chart': //bmi-chart
        echo $twig->render('bmi_chart.twig', array(
            'title' => 'BMI Chart',
            'og_description' => 'Check out the BMI Chart to find your Body Mass Index!',
            'og_img_url' => 'https://bmicalculator.mes.fm/images/bmi-chart.png',
            'page_title' => 'BMI Chart',
            'page_description' => 'This BMI Chart or BMI Table displays what category each BMI falls under and shows it in Table format.<br><br>
            The formula used to calculate BMI can be found here: <a class="link" href="bmi-formula">BMI Formula</a>.',
            'current_tab' => '5'
        ));
        break;
    case '/bmi-formula': //bmi-formula
        echo $twig->render('bmi_formula.twig', array(
            'title' => 'BMI Formula',
            'page_title' => 'BMI Formula',
            'og_description' => 'Check out the BMI Formula that is used to calculate your BMI!',
            'page_description' => 'The BMI Formula is displayed in both metric and imperial units of measurement.<br><br>A chart of how BMI varies with height and weight can be found here: <a class="link" href="bmi-chart">BMI Chart</a>.',
            'current_tab' => '6'
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
            'show_articles' => false
        ));
        break;
    default: //page not found
        header('HTTP/1.0 404 Not Found');
        echo $twig->render('page_not_found.twig', array(
            'title' => 'Page Not Found'
        ));
}

?>