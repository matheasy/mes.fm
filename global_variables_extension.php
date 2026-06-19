<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://mes.fm'.$this->uri,
            'local_root' => 'home_page',
            'tag_manager' => false,
            'calc_name' => 'Math Easy Solutions',
            'dark_color' => '#5ea9dd',
            'light_color' => '#eef0ff',
            'highlight_color' => '#5090bd',
            'fb_id' => '120877788060946',
            'og_type' => 'website',
            'og_title' => 'Math Easy Solutions',
            'og_description' => 'Math Easy Solutions: The one stop for video tutorials, funny math memes, useful calculators and all things math.',
            'ga_id' => 'UA-26555847-4',
            'url_short' => 'mes.fm',
            'policy_date_modified' => 'Jan 8, 2016',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'resp_rect' => true,
            'resp_vert_mobile' => true,
            'disqus_url' => 'matheasysolutions',
            'subscribe_data' => array(
                'url' => 'https://mes.us13.list-manage.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=24c1c9c11a',
                'form' => '//mes.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=24c1c9c11a',
                'id' => '24c1c9c11a'
                ),
            'ad_id' => array(
                'resp_horiz' => '4812438869',
                'resp_rect' => '1337595263',
                'resp_vert' => '8125832063',
                ),
            'social_medias' => array(
                'fb' => 'matheasysolutions',
                'twitter' => 'MathEasySolns',
                'insta' => 'matheasysolutions',
                'gplus' => '+MathEasySolutionsPage',
                'pin' => 'matheasysolns',
                'yt' => 'MathEasySolutions',
                'patreon' => 'matheasysolutions',
                'steemit' => '@mes',
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'puzzles',
                    'label'=>'Puzzles'
                    ),
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>'https://www.youtube.com/user/MathEasySolutions/videos',
                    'label'=>'Videos'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'puzzles',
                    'label'=>'Puzzles'
                    ),
                array(
                    'url'=>$this->root_domain.'memes',
                    'label'=>'Memes'
                    ),
                array(
                    'url'=>'https://www.youtube.com/user/MathEasySolutions/videos',
                    'label'=>'Videos'
                    ),
                array(
                    'url'=>$this->root_domain.'calculators',
                    'label'=>'Calculators'
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