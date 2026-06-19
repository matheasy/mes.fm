<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://bmicalculator.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://bmicalculator.mes.fm'.$this->uri,
            'local_root' => 'bmi',
            'tag_manager' => 'GTM-K28F7WZ',
            'calc_name' => 'BMI Calculator',
            'dark_color' => '#c275b1',
            'light_color' => '#f8e2ed',
            'highlight_color' => '#a76599',
            'fb_id' => '1441259629447913',
            'og_type' => 'website',
            'og_title' => 'BMI Calculator by Math Easy Solutions',
            'og_description' => 'Use this BMI Calculator to calculate your body mass index by entering your height and weight!',
            'ga_id' => 'UA-18189318-9',
            'url_short' => 'bmicalculator.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'The one stop for Health, Fitness, and Nutrition',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => true,
            'bmi_home_above_comments' => false,
            'contact_email' => 'bmi@mes.fm',
            'disqus_url' => 'bmimes',
            'app_store_link' => 'https://itunes.apple.com/ca/app/bmi-calculator-by-mes/id1226817243',
            'google_play_link' => 'https://play.google.com/store/apps/details?id=com.mike.bmiCalculator',
            'subscribe_data' => array(
                'url' => 'https://bmicalculator.us13.list-manage2.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=2e7da1d0fb',
                'form' => '//bmicalculator.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=2e7da1d0fb',
                'id' => '2e7da1d0fb'
                ),
            'ad_id' => array(
                'resp_horiz' => '1359444863',
                'resp_rect' => '3046281265',
                'resp_vert' => '9103037666',
                'link1' => '5636953717', // 200x90 #1
                'link2' => '1237794869', // 200x90 #2
                'link3' => '7390751667', // 728x15
                'm_link3' => '1478109262',
                ),
            'articles' => array(
                array(
                    'class' => 'latest-article',
                    'url' => 'https://www.amazon.ca/dp/B076HD8MM2',
                    'tag_line' => 'Help save the planet. Use our stainless steel straws to prevent more plastic from going to landfills. Also save money while you obtain your health goals!',
                    'img_url' => 'https://mes.fm/main_img/steelstraws.jpg',
                    'img_alt' => 'BMI Calculator\'s Stainless Steel Straws',
                    'title' => 'BMI Calculator\'s Eco-Friendly Straws'
                    ),
                array(
                    'class' => 'latest-article',
                    'url' => 'https://bmicalculator.mes.fm/sports/top-10-soccer-player-bmi',
                    'tag_line' => 'Ever wonder what your favourite athlete\'s BMI is? Click here!',
                    'img_url' => 'https://bmicalculator.mes.fm/img/ronaldo-thumbnail.jpg',
                    'img_alt' => 'Cristiano Ronaldo',
                    'title' => 'Top 10 Soccer Players\' BMI'
                    ),
                array(
                    'class' => 'latest-article',
                    'url' => 'https://bmicalculator.mes.fm/sports/top-10-nba-player-bmi',
                    'tag_line' => 'Ever wonder what your favourite athlete\'s BMI is? Click here!',
                    'img_url' => 'https://bmicalculator.mes.fm/img/lebron-thumbnail.jpg',
                    'img_alt' => 'Lebron James',
                    'title' => 'Top 10 NBA Players\' BMI'
                    )                
                ),
            'social_medias' => array(
                'fb' => 'BMICalculatorMES',
                'twitter' => 'bmicalculator__',
                'insta' => 'bmicalculator',
                'gplus' => '+BmiCalculatorCcPage',
                'pin' => 'BMI_Calculator',
                'steemit' => '@bmicalculator'
                ),

            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'health-tips',
                    'label'=>'Health Tips',
                    ),
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>$this->root_domain.'body-mass-index',
                    'label'=>'What is BMI?',
                    ),
                array(
                    'url'=>$this->root_domain.'bmi-chart',
                    'label'=>'BMI Chart',
                    ),
                array(
                    'url'=>$this->root_domain.'bmi-formula',
                    'label'=>'BMI Formula',
                    ),
                array(
                    'url'=>$this->root_domain.'sports',
                    'label'=>'Sports Articles',
                    ),
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'health-tips',
                    'label'=>'Health Tips'
                    ),
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>$this->root_domain.'body-mass-index',
                    'label'=>'What is BMI?',
                    ),
                array(
                    'url'=>$this->root_domain.'bmi-chart',
                    'label'=>'Chart'
                    ),
                array(
                    'url'=>$this->root_domain.'bmi-formula',
                    'label'=>'Formula'
                    ),
                /*array(
                    'url'=>'https://bmicalculator.mes.fm/e-book',
                    'label'=>'E-Book',
                    ),
                array(
                    'url'=>'https://bmicalculator.mes.fm/consultation',
                    'label'=>'Consultation',
                    ),*/
                array(
                    'url'=>$this->root_domain.'sports',
                    'label'=>'Sports'
                    )
                )
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>