<?php
class Global_Variables_Extension extends \Twig_Extension
{

    public function __construct($localhost,$mobile,$uri) 
    {
        $this->localhost = $localhost;
        $this->mobile = $mobile;
        $this->uri = rtrim($uri, '/');
        $this->base = $mobile ? 'base_mobile.twig' : 'base.twig';
        $this->root_domain = $localhost ? "" : "https://sjwkeyboard.mes.fm/";
    }

    public function getGlobals()
    {
        return array(
            'localhost' => $this->localhost,
            'root_domain' => $this->root_domain,
            'mobile' => $this->mobile,
            'base' => $this->base,
            'url' => 'https://sjwkeyboard.mes.fm'.$this->uri,
            'local_root' => 'sjw',
            'tag_manager' => false,
            'calc_name' => 'Social Justice Warrior Keyboard',
            'dark_color' => '#9400D3',
            'light_color' => '#E6E6FA',
            'highlight_color' => '#4B0082',
            'fb_id' => '',
            'og_type' => 'website',
            'og_title' => 'Social Justice Warrior Keyboard by Math Easy Solutions',
            'og_description' => 'Being a SJW is tough work; let us do the heavy lifting.',
            'ga_id' => 'UA-18189318-22',
            'url_short' => 'sjwkeyboard.mes.fm',
            'policy_date_modified' => 'April 20, 2017',
            'tag_line' => '',
            'show_ads' => $this->localhost ? false : true,
            'show_articles' => false,
            'contact_email' => 'contact@mes.fm',
            'disqus_url' => 'sjw-keyboard',
            'resp_rect' => true,
            'resp_vert_mobile' => true,
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
                'patreon' => 'matheasysolutions'
                ),
            /*'navbar' => array(
                array(
                    'url'=>$this->root_domain.'',
                    'label'=>''
                    )
                ),
            'navbar_mobile' => array(
                array(
                    'url'=>$this->root_domain.'',
                    'label'=>''
                    )
                )*/
        );
    }

    public function getName()
    {
        return 'Global_Variables_Extension';
    }
}
?>