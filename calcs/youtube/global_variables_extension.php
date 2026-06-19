<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://youtubemoney.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://youtubemoney.mes.fm'.$this->uri,
            'local_root' => 'youtube',
            'tag_manager' => 'GTM-MR4PFN3',
            'calc_name' => 'YouTube Money Calculator',
            'dark_color' => '#a21d22',
            'light_color' => '#fac7c5',
            'highlight_color' => '#7d161a',
            'fb_id' => '772925259438367',
            'og_type' => 'website',
            'og_title' => 'YouTube Money Calculator by Math Easy Solutions',
            'og_description' => 'Use this YouTube Money Calculator to calculate how much revenue YouTubers can make!',
            'ga_id' => 'UA-18189318-14',
            'url_short' => 'youtubemoney.mes.fm',
            'policy_date_modified' => 'Oct 8, 2014',
            'tag_line' => 'Calculate money made from YouTube videos',
            'addthis_id' => 'ra-53b7585d09d9e0bd',
            'hide_search' => true,
            'show_ads' => false,
            'show_youtube_ads' => true,
            'show_articles' => false,
            'contact_email' => 'ymc@mes.fm',
            'disqus_url' => 'youtubemoneymes',
            'subscribe_data' => array(
                'url' => 'https://youtubemoney.us13.list-manage1.com/subscribe?u=dbcd5a985e8f82625fa9deab8&id=50478e428e',
                'form' => '//youtubemoney.us13.list-manage.com/subscribe/post?u=dbcd5a985e8f82625fa9deab8&amp;id=50478e428e',
                'id' => '50478e428e'
                ),
            'social_medias' => array(
                'fb' => 'youtubecalculator',
                'twitter' => 'youtubemoneycal',
                'gplus' => '+YoutubemoneyCoMES',
                ),
            'navbar' => array(
                array(
                    'url'=>$this->root_domain.'youtubers',
                    'label'=>'How much do YouTuber\'s make?'
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'youtubers',
                    'label'=>'How much do YouTuber\'s make?'
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